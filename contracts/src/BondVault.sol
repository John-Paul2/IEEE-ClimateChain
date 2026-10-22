// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DeviceRegistry} from "./DeviceRegistry.sol";

/// @title BondVault
/// @notice Holds operator bonds and verifier stakes, enforces withdrawal delays and challenge locks,
///         and executes slashing and reward distribution using a pull-payment pattern.
/// @dev Conforms to docs/INTERFACES.md Section 8.3. No upgradeable proxies.
contract BondVault is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CHALLENGE_CONTRACT_ROLE = keccak256("CHALLENGE_CONTRACT_ROLE");
    bytes32 public constant QUORUM_CONTRACT_ROLE = keccak256("QUORUM_CONTRACT_ROLE");

    uint16 public constant MAX_BPS = 10_000;

    struct PendingWithdrawal {
        uint256 amount;
        uint64 unlockTimestamp;
    }

    error ZeroDeposit();
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBondBalance(uint256 available, uint256 requested);
    error WithdrawalDelayNotElapsed(uint64 currentTimestamp, uint64 unlockTimestamp);
    error NoPendingWithdrawal();
    error ActiveChallengeBlocksWithdrawal(bytes32 installationId);
    error NothingToClaim();
    error TransferFailed();
    error UnauthorizedCaller(address caller);
    error InvalidBps(uint16 bps);

    event OperatorBondDeposited(
        bytes32 indexed installationId,
        address indexed depositor,
        uint256 amount,
        uint256 newBalance
    );
    event VerifierStakeDeposited(address indexed verifier, uint256 amount, uint256 newBalance);
    event WithdrawalRequested(
        address indexed account,
        bytes32 indexed installationId,
        uint256 amount,
        uint64 unlockTimestamp
    );
    event WithdrawalExecuted(address indexed account, bytes32 indexed installationId, uint256 amount);
    event OperatorSlashed(
        bytes32 indexed installationId,
        uint256 slashAmount,
        uint256 verifierRewardShare,
        uint256 treasuryShare
    );
    event VerifierSlashed(address indexed verifier, uint256 slashAmount, address indexed recipient);
    event RewardsClaimed(address indexed recipient, uint256 amount);
    event ChallengeLockUpdated(bytes32 indexed installationId, uint256 activeChallengeCount);

    DeviceRegistry public immutable deviceRegistry;
    uint256 public minOperatorBondWei;
    uint256 public minVerifierStakeWei;
    uint64 public withdrawalDelaySeconds;
    uint16 public verifierRewardShareBps; // e.g. 7000 = 70% to honest verifiers, 30% to treasury

    mapping(bytes32 => uint256) private _operatorBonds;
    mapping(bytes32 => address) public installationDepositor;
    mapping(address => uint256) private _verifierStakes;
    mapping(bytes32 => PendingWithdrawal) public pendingOperatorWithdrawals;
    mapping(address => PendingWithdrawal) public pendingVerifierWithdrawals;
    mapping(bytes32 => uint256) public activeChallengesCount;

    mapping(address => uint256) public claimableRewards;
    mapping(address => uint256) public treasuryBalances;

    uint256 public totalOperatorBonds;
    uint256 public totalVerifierStakes;
    uint256 public totalClaimableRewards;
    uint256 public totalTreasuryBalances;
    mapping(bytes32 => uint256) public cumulativeOperatorSlashed;
    mapping(bytes32 => uint256) public cumulativeOperatorDeposited;

    /// @notice Initializes the BondVault with staking thresholds and withdrawal parameters.
    /// @param admin Administrator address.
    /// @param registry DeviceRegistry contract reference for operator ownership checks.
    /// @param minOpBond Minimum operator bond in wei required to anchor batches.
    /// @param minVerStake Minimum verifier stake in wei required to vote.
    /// @param withdrawDelay Mandatory delay in seconds between withdrawal request and execution.
    /// @param rewardShareBps Share in basis points (0..10000) of slashed operator bonds awarded to verifiers.
    constructor(
        address admin,
        DeviceRegistry registry,
        uint256 minOpBond,
        uint256 minVerStake,
        uint64 withdrawDelay,
        uint16 rewardShareBps
    ) {
        if (admin == address(0) || address(registry) == address(0)) revert ZeroAddress();
        if (rewardShareBps > MAX_BPS) revert InvalidBps(rewardShareBps);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        deviceRegistry = registry;
        minOperatorBondWei = minOpBond;
        minVerifierStakeWei = minVerStake;
        withdrawalDelaySeconds = withdrawDelay;
        verifierRewardShareBps = rewardShareBps;
    }

    /// @notice Deposits native currency into an installation's operator bond balance.
    /// @param installationId Deterministic bytes32 identifier of the installation.
    function depositOperatorBond(bytes32 installationId) external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroDeposit();
        if (installationId == bytes32(0)) revert ZeroAddress();

        _operatorBonds[installationId] += msg.value;
        totalOperatorBonds += msg.value;
        cumulativeOperatorDeposited[installationId] += msg.value;

        if (installationDepositor[installationId] == address(0)) {
            installationDepositor[installationId] = msg.sender;
        }

        emit OperatorBondDeposited(installationId, msg.sender, msg.value, _operatorBonds[installationId]);
    }

    /// @notice Deposits native currency into the caller's verifier stake balance.
    function depositVerifierStake() external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroDeposit();

        _verifierStakes[msg.sender] += msg.value;
        totalVerifierStakes += msg.value;

        emit VerifierStakeDeposited(msg.sender, msg.value, _verifierStakes[msg.sender]);
    }

    /// @notice Initiates a time-delayed withdrawal from an installation's operator bond.
    /// @param installationId The installation identifier.
    /// @param amount Amount in wei to withdraw after the delay.
    function requestOperatorWithdraw(bytes32 installationId, uint256 amount) external whenNotPaused {
        address op = _resolveInstallationOperator(installationId);
        if (op == address(0) || msg.sender != op) revert UnauthorizedCaller(msg.sender);
        if (activeChallengesCount[installationId] > 0) {
            revert ActiveChallengeBlocksWithdrawal(installationId);
        }
        if (amount == 0) revert ZeroAmount();

        uint256 available = _operatorBonds[installationId];
        if (amount > available) {
            revert InsufficientBondBalance(available, amount);
        }

        uint64 unlockTs = uint64(block.timestamp) + withdrawalDelaySeconds;
        pendingOperatorWithdrawals[installationId] = PendingWithdrawal({
            amount: amount,
            unlockTimestamp: unlockTs
        });

        emit WithdrawalRequested(msg.sender, installationId, amount, unlockTs);
    }

    /// @notice Executes a matured operator bond withdrawal if no challenge is currently open.
    /// @param installationId The installation identifier.
    function executeOperatorWithdraw(bytes32 installationId) external whenNotPaused nonReentrant {
        address op = _resolveInstallationOperator(installationId);
        if (op == address(0) || msg.sender != op) revert UnauthorizedCaller(msg.sender);
        if (activeChallengesCount[installationId] > 0) {
            revert ActiveChallengeBlocksWithdrawal(installationId);
        }

        PendingWithdrawal memory pending = pendingOperatorWithdrawals[installationId];
        if (pending.amount == 0) revert NoPendingWithdrawal();
        if (uint64(block.timestamp) < pending.unlockTimestamp) {
            revert WithdrawalDelayNotElapsed(uint64(block.timestamp), pending.unlockTimestamp);
        }

        uint256 available = _operatorBonds[installationId];
        if (pending.amount > available) {
            revert InsufficientBondBalance(available, pending.amount);
        }

        delete pendingOperatorWithdrawals[installationId];
        _operatorBonds[installationId] -= pending.amount;
        totalOperatorBonds -= pending.amount;

        _safeTransferETH(msg.sender, pending.amount);

        emit WithdrawalExecuted(msg.sender, installationId, pending.amount);
    }

    /// @notice Initiates a time-delayed withdrawal from the caller's verifier stake.
    /// @param amount Amount in wei to withdraw after the delay.
    function requestVerifierWithdraw(uint256 amount) external whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        uint256 available = _verifierStakes[msg.sender];
        if (amount > available) {
            revert InsufficientBondBalance(available, amount);
        }

        uint64 unlockTs = uint64(block.timestamp) + withdrawalDelaySeconds;
        pendingVerifierWithdrawals[msg.sender] = PendingWithdrawal({
            amount: amount,
            unlockTimestamp: unlockTs
        });

        emit WithdrawalRequested(msg.sender, bytes32(0), amount, unlockTs);
    }

    /// @notice Executes a matured verifier stake withdrawal.
    function executeVerifierWithdraw() external whenNotPaused nonReentrant {
        PendingWithdrawal memory pending = pendingVerifierWithdrawals[msg.sender];
        if (pending.amount == 0) revert NoPendingWithdrawal();
        if (uint64(block.timestamp) < pending.unlockTimestamp) {
            revert WithdrawalDelayNotElapsed(uint64(block.timestamp), pending.unlockTimestamp);
        }

        uint256 available = _verifierStakes[msg.sender];
        if (pending.amount > available) {
            revert InsufficientBondBalance(available, pending.amount);
        }

        delete pendingVerifierWithdrawals[msg.sender];
        _verifierStakes[msg.sender] -= pending.amount;
        totalVerifierStakes -= pending.amount;

        _safeTransferETH(msg.sender, pending.amount);

        emit WithdrawalExecuted(msg.sender, bytes32(0), pending.amount);
    }

    /// @notice Slashes an installation's operator bond and allocates pull-payment rewards to honest verifiers and treasury.
    /// @dev Callable only by the authorized Challenge contract.
    /// @param installationId The installation whose bond is slashed.
    /// @param slashAmount Exact amount in wei to slash from the installation's bond.
    /// @param honestVerifiers Array of verifier addresses that voted to flag the fraudulent batch.
    /// @param treasury Treasury recipient address receiving the non-verifier portion (and any rounding remainder).
    function slashOperator(
        bytes32 installationId,
        uint256 slashAmount,
        address[] calldata honestVerifiers,
        address treasury
    ) external whenNotPaused {
        if (!hasRole(CHALLENGE_CONTRACT_ROLE, msg.sender)) {
            revert UnauthorizedCaller(msg.sender);
        }
        if (treasury == address(0)) revert ZeroAddress();

        uint256 available = _operatorBonds[installationId];
        if (slashAmount > available) {
            revert InsufficientBondBalance(available, slashAmount);
        }

        _operatorBonds[installationId] = available - slashAmount;
        totalOperatorBonds -= slashAmount;
        cumulativeOperatorSlashed[installationId] += slashAmount;

        // Clamp any pending withdrawal so it never exceeds remaining bond
        if (pendingOperatorWithdrawals[installationId].amount > _operatorBonds[installationId]) {
            pendingOperatorWithdrawals[installationId].amount = _operatorBonds[installationId];
        }

        uint256 verifierRewardPool = (slashAmount * verifierRewardShareBps) / MAX_BPS;
        uint256 distributedVerifierShare = 0;

        uint256 count = honestVerifiers.length;
        if (count > 0 && verifierRewardPool > 0) {
            uint256 perVerifier = verifierRewardPool / count;
            if (perVerifier > 0) {
                for (uint256 i = 0; i < count; ++i) {
                    address v = honestVerifiers[i];
                    if (v == address(0)) revert ZeroAddress();
                    claimableRewards[v] += perVerifier;
                }
                distributedVerifierShare = perVerifier * count;
                totalClaimableRewards += distributedVerifierShare;
            }
        }

        uint256 treasuryShare = slashAmount - distributedVerifierShare;
        if (treasuryShare > 0) {
            claimableRewards[treasury] += treasuryShare;
            treasuryBalances[treasury] += treasuryShare;
            totalClaimableRewards += treasuryShare;
            totalTreasuryBalances += treasuryShare;
        }

        emit OperatorSlashed(installationId, slashAmount, distributedVerifierShare, treasuryShare);
    }

    /// @notice Slashes a verifier's stake (for overturned fraud flags or failure to reveal) and credits recipient via pull-payment.
    /// @dev Callable only by Challenge or VerifierQuorum contracts.
    /// @param verifier Address of the verifier being penalized.
    /// @param slashAmount Amount in wei to slash.
    /// @param recipient Address credited with the slashed stake (operator or treasury).
    function slashVerifier(address verifier, uint256 slashAmount, address recipient) external whenNotPaused {
        if (
            !hasRole(CHALLENGE_CONTRACT_ROLE, msg.sender) &&
            !hasRole(QUORUM_CONTRACT_ROLE, msg.sender)
        ) {
            revert UnauthorizedCaller(msg.sender);
        }
        if (verifier == address(0) || recipient == address(0)) revert ZeroAddress();

        uint256 available = _verifierStakes[verifier];
        if (slashAmount > available) {
            revert InsufficientBondBalance(available, slashAmount);
        }

        _verifierStakes[verifier] = available - slashAmount;
        totalVerifierStakes -= slashAmount;

        if (pendingVerifierWithdrawals[verifier].amount > _verifierStakes[verifier]) {
            pendingVerifierWithdrawals[verifier].amount = _verifierStakes[verifier];
        }

        claimableRewards[recipient] += slashAmount;
        totalClaimableRewards += slashAmount;

        emit VerifierSlashed(verifier, slashAmount, recipient);
    }

    /// @notice Increments or decrements the open challenge lock counter for an installation.
    /// @dev Callable only by the authorized Challenge contract.
    /// @param installationId The installation identifier.
    /// @param isOpen True when a challenge is opened, false when resolved or settled.
    function setChallengeStatus(bytes32 installationId, bool isOpen) external {
        if (!hasRole(CHALLENGE_CONTRACT_ROLE, msg.sender)) {
            revert UnauthorizedCaller(msg.sender);
        }
        if (isOpen) {
            activeChallengesCount[installationId] += 1;
        } else if (activeChallengesCount[installationId] > 0) {
            activeChallengesCount[installationId] -= 1;
        }
        emit ChallengeLockUpdated(installationId, activeChallengesCount[installationId]);
    }

    /// @notice Pull-payment withdrawal of accumulated verifier rewards, operator compensation, or treasury shares.
    function claimRewards() external whenNotPaused nonReentrant {
        uint256 reward = claimableRewards[msg.sender];
        if (reward == 0) revert NothingToClaim();

        claimableRewards[msg.sender] = 0;
        totalClaimableRewards -= reward;

        uint256 trBal = treasuryBalances[msg.sender];
        if (trBal > 0) {
            uint256 deducted = reward >= trBal ? trBal : reward;
            treasuryBalances[msg.sender] -= deducted;
            totalTreasuryBalances -= deducted;
        }

        _safeTransferETH(msg.sender, reward);

        emit RewardsClaimed(msg.sender, reward);
    }

    /// @notice Returns the current operator bond balance (in wei) for an installation.
    /// @param installationId The installation identifier.
    /// @return Bond balance in wei.
    function operatorBondOf(bytes32 installationId) external view returns (uint256) {
        return _operatorBonds[installationId];
    }

    /// @notice Returns the current stake balance (in wei) for a verifier.
    /// @param verifier The verifier address.
    /// @return Stake balance in wei.
    function verifierStakeOf(address verifier) external view returns (uint256) {
        return _verifierStakes[verifier];
    }

    /// @notice Checks whether an installation holds at least minOperatorBondWei.
    /// @param installationId The installation identifier.
    /// @return True if operatorBondOf(installationId) >= minOperatorBondWei.
    function hasSufficientOperatorBond(bytes32 installationId) external view returns (bool) {
        return _operatorBonds[installationId] >= minOperatorBondWei;
    }

    /// @notice Checks whether a verifier holds at least minVerifierStakeWei.
    /// @param verifier The verifier address.
    /// @return True if verifierStakeOf(verifier) >= minVerifierStakeWei.
    function hasSufficientVerifierStake(address verifier) external view returns (bool) {
        return _verifierStakes[verifier] >= minVerifierStakeWei;
    }

    /// @notice Updates withdrawal delay and minimum bond/stake parameters. Callable only by ADMIN_ROLE.
    /// @param minOpBond New minimum operator bond in wei.
    /// @param minVerStake New minimum verifier stake in wei.
    /// @param withdrawDelay New withdrawal delay in seconds.
    /// @param rewardShareBps New verifier reward share in basis points (0..10000).
    function updateParameters(
        uint256 minOpBond,
        uint256 minVerStake,
        uint64 withdrawDelay,
        uint16 rewardShareBps
    ) external onlyRole(ADMIN_ROLE) {
        if (rewardShareBps > MAX_BPS) revert InvalidBps(rewardShareBps);
        minOperatorBondWei = minOpBond;
        minVerifierStakeWei = minVerStake;
        withdrawalDelaySeconds = withdrawDelay;
        verifierRewardShareBps = rewardShareBps;
    }

    /// @notice Pauses state-mutating vault operations. Callable only by ADMIN_ROLE.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses state-mutating vault operations. Callable only by ADMIN_ROLE.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _resolveInstallationOperator(bytes32 installationId) internal view returns (address) {
        address op = deviceRegistry.getInstallationOperator(installationId);
        return op != address(0) ? op : installationDepositor[installationId];
    }

    function _safeTransferETH(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
