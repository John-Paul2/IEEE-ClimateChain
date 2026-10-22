// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DeviceRegistry} from "../src/DeviceRegistry.sol";
import {BondVault} from "../src/BondVault.sol";
import {BatchAnchor} from "../src/BatchAnchor.sol";
import {VerifierQuorum, IChallenge} from "../src/VerifierQuorum.sol";
import {Challenge} from "../src/Challenge.sol";
import {Attestation} from "../src/Attestation.sol";

/// @title Deploy
/// @notice Foundry deployment script that reads parameters from ../config/params.yaml for "demo" or "real" ("benchmark")
///         profiles, deploys all six VeriCEMS contracts, wires roles, and writes ../deployments/anvil.json.
contract Deploy is Script {
    struct ProfileParams {
        string profileName;
        uint8 verifierCount;
        uint8 requiredMatches;
        uint256 minOperatorBondWei;
        uint256 minVerifierStakeWei;
        uint16 operatorSlashBps;
        uint16 verifierRewardShareBps;
        uint16 carelessVerifierSlashBps;
        uint16 unrevealedPenaltyBps;
        uint8 requiredArbiterApprovals;
        uint64 commitWindowSeconds;
        uint64 revealWindowSeconds;
        uint64 challengeWindowSeconds;
        uint64 withdrawalDelaySeconds;
    }

    struct DeployedContracts {
        DeviceRegistry deviceRegistry;
        BondVault bondVault;
        BatchAnchor batchAnchor;
        VerifierQuorum verifierQuorum;
        Challenge challenge;
        Attestation attestation;
    }

    function run() external returns (DeployedContracts memory deployed, ProfileParams memory params) {
        string memory profile = vm.envOr("VERICEMS_PROFILE", string("demo"));
        params = loadParamsFromYaml("../config/params.yaml", profile);

        // Deterministic Anvil accounts on local chain, or msg.sender / env on testnet
        address admin = vm.envOr(
            "VERICEMS_ADMIN",
            block.chainid == 31337 ? address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266) : msg.sender
        );
        address treasury = vm.envOr(
            "VERICEMS_TREASURY",
            block.chainid == 31337 ? address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8) : admin
        );

        address[] memory verifiers = new address[](5);
        address[] memory arbiters = new address[](3);

        if (block.chainid == 31337) {
            verifiers[0] = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
            verifiers[1] = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;
            verifiers[2] = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
            verifiers[3] = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;
            verifiers[4] = 0x976EA74026E726554dB657fA54763abd0C3a0aa9;

            arbiters[0] = 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955;
            arbiters[1] = 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f;
            arbiters[2] = 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720;
        } else {
            for (uint256 i = 0; i < 5; ++i) {
                uint256 privKey = uint256(keccak256(abi.encodePacked("vericems.testnet.verifier", admin, i)));
                verifiers[i] = vm.addr(privKey);
            }
            for (uint256 i = 0; i < 3; ++i) {
                uint256 privKey = uint256(keccak256(abi.encodePacked("vericems.testnet.arbiter", admin, i)));
                arbiters[i] = vm.addr(privKey);
            }
        }

        if (block.chainid == 31337 && msg.sender != admin) {
            vm.startBroadcast(admin);
        } else {
            vm.startBroadcast();
        }
        deployed = _deployAndWire(admin, treasury, verifiers, arbiters, params);

        if (block.chainid != 31337) {
            for (uint256 i = 0; i < 5; ++i) {
                (bool s1, ) = payable(verifiers[i]).call{value: 0.001 ether}("");
                require(s1, "fund verifier failed");
            }
            for (uint256 i = 0; i < 3; ++i) {
                (bool s2, ) = payable(arbiters[i]).call{value: 0.001 ether}("");
                require(s2, "fund arbiter failed");
            }
        }
        vm.stopBroadcast();

        string memory defaultOut = block.chainid == 31337 ? "../deployments/anvil.json" : "../deployments/testnet.json";
        string memory outputPath = vm.envOr("VERICEMS_DEPLOYMENT_OUT", defaultOut);
        writeDeploymentJson(outputPath, deployed, params, admin, treasury, verifiers, arbiters);
    }

    function deployAll(
        address admin,
        address treasury,
        address[] memory verifiers,
        address[] memory arbiters,
        ProfileParams memory params
    ) public returns (DeployedContracts memory d) {
        vm.startPrank(admin);
        d = _deployAndWire(admin, treasury, verifiers, arbiters, params);
        vm.stopPrank();
    }

    function _deployAndWire(
        address admin,
        address treasury,
        address[] memory verifiers,
        address[] memory arbiters,
        ProfileParams memory params
    ) internal returns (DeployedContracts memory d) {
        d.deviceRegistry = new DeviceRegistry(admin);

        d.bondVault = new BondVault(
            admin,
            d.deviceRegistry,
            params.minOperatorBondWei,
            params.minVerifierStakeWei,
            params.withdrawalDelaySeconds,
            params.verifierRewardShareBps
        );

        d.batchAnchor = new BatchAnchor(admin, d.deviceRegistry, d.bondVault);

        d.verifierQuorum = new VerifierQuorum(
            admin,
            d.bondVault,
            d.batchAnchor,
            treasury,
            params.verifierCount,
            params.requiredMatches,
            params.commitWindowSeconds,
            params.revealWindowSeconds,
            params.unrevealedPenaltyBps
        );

        d.challenge = new Challenge(
            admin,
            d.deviceRegistry,
            d.bondVault,
            d.batchAnchor,
            d.verifierQuorum,
            treasury,
            params.challengeWindowSeconds,
            params.operatorSlashBps,
            params.carelessVerifierSlashBps,
            params.requiredArbiterApprovals
        );

        d.attestation = new Attestation(admin, d.deviceRegistry, d.batchAnchor);

        // Wire cross-contract roles
        d.bondVault.grantRole(d.bondVault.CHALLENGE_CONTRACT_ROLE(), address(d.challenge));
        d.bondVault.grantRole(d.bondVault.QUORUM_CONTRACT_ROLE(), address(d.verifierQuorum));

        d.batchAnchor.grantRole(d.batchAnchor.QUORUM_CONTRACT_ROLE(), address(d.verifierQuorum));
        d.batchAnchor.grantRole(d.batchAnchor.CHALLENGE_CONTRACT_ROLE(), address(d.challenge));

        d.verifierQuorum.setChallengeContract(IChallenge(address(d.challenge)));

        // Register 5 verifiers
        for (uint256 i = 0; i < verifiers.length && i < params.verifierCount; ++i) {
            d.verifierQuorum.registerVerifier(verifiers[i]);
            d.challenge.grantRole(d.challenge.VERIFIER_ROLE(), verifiers[i]);
        }

        // Register 3 council arbiters (2-of-3 approvals)
        for (uint256 i = 0; i < arbiters.length; ++i) {
            d.challenge.grantRole(d.challenge.ARBITER_ROLE(), arbiters[i]);
        }
    }

    /// @notice Reads and parses ../config/params.yaml for either "demo" or "real" ("benchmark") profile.
    function loadParamsFromYaml(
        string memory yamlPath,
        string memory profile
    ) public view returns (ProfileParams memory p) {
        string memory raw = vm.readFile(yamlPath);
        bytes memory b = bytes(raw);

        bool isTestnet = keccak256(bytes(profile)) == keccak256(bytes("testnet"));
        bool isReal = keccak256(bytes(profile)) == keccak256(bytes("real")) ||
            keccak256(bytes(profile)) == keccak256(bytes("benchmark"));

        p.profileName = isTestnet ? "testnet" : (isReal ? "real" : "demo");
        p.verifierCount = uint8(_extractUintAfterKey(b, "verifier_count:", 0));
        p.requiredMatches = uint8(_extractUintAfterKey(b, "required_matches:", 0));
        p.operatorSlashBps = uint16(_extractUintAfterKey(b, "operator_slash_bps:", 0));
        p.verifierRewardShareBps = uint16(_extractUintAfterKey(b, "verifier_Reward_share_bps:", 0));
        p.carelessVerifierSlashBps = uint16(_extractUintAfterKey(b, "careless_verifier_slash_bps:", 0));
        p.unrevealedPenaltyBps = p.carelessVerifierSlashBps;
        p.requiredArbiterApprovals = 2;

        string memory sectionNeedle = isTestnet ? "  testnet:" : (isReal ? "  benchmark:" : "  demo:");
        uint256 sectionOffset = _findSubstring(b, sectionNeedle, 0);

        if (isTestnet) {
            p.minOperatorBondWei = _extractUintAfterKey(b, "min_operator_bond_wei:", sectionOffset);
            p.minVerifierStakeWei = _extractUintAfterKey(b, "min_verifier_stake_wei:", sectionOffset);
        } else {
            p.minOperatorBondWei = _extractUintAfterKey(b, "min_operator_bond_wei:", 0);
            p.minVerifierStakeWei = _extractUintAfterKey(b, "min_verifier_stake_wei:", 0);
        }

        p.commitWindowSeconds = uint64(_extractUintAfterKey(b, "commit_window_seconds:", sectionOffset));
        p.revealWindowSeconds = uint64(_extractUintAfterKey(b, "reveal_window_seconds:", sectionOffset));
        p.challengeWindowSeconds = uint64(_extractUintAfterKey(b, "challenge_window_seconds:", sectionOffset));
        p.withdrawalDelaySeconds = uint64(_extractUintAfterKey(b, "withdrawal_delay_seconds:", sectionOffset));
    }

    function writeDeploymentJson(
        string memory outputPath,
        DeployedContracts memory d,
        ProfileParams memory p,
        address admin,
        address treasury,
        address[] memory verifiers,
        address[] memory arbiters
    ) internal {
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeString(obj, "profile", p.profileName);
        vm.serializeAddress(obj, "admin", admin);
        vm.serializeAddress(obj, "treasury", treasury);

        string memory contractsObj = "contracts";
        vm.serializeAddress(contractsObj, "DeviceRegistry", address(d.deviceRegistry));
        vm.serializeAddress(contractsObj, "BondVault", address(d.bondVault));
        vm.serializeAddress(contractsObj, "BatchAnchor", address(d.batchAnchor));
        vm.serializeAddress(contractsObj, "VerifierQuorum", address(d.verifierQuorum));
        vm.serializeAddress(contractsObj, "Challenge", address(d.challenge));
        string memory contractsJson = vm.serializeAddress(contractsObj, "Attestation", address(d.attestation));
        vm.serializeString(obj, "contracts", contractsJson);

        string memory paramsObj = "parameters";
        vm.serializeUint(paramsObj, "verifierCount", p.verifierCount);
        vm.serializeUint(paramsObj, "requiredMatches", p.requiredMatches);
        vm.serializeUint(paramsObj, "minOperatorBondWei", p.minOperatorBondWei);
        vm.serializeUint(paramsObj, "minVerifierStakeWei", p.minVerifierStakeWei);
        vm.serializeUint(paramsObj, "operatorSlashBps", p.operatorSlashBps);
        vm.serializeUint(paramsObj, "verifierRewardShareBps", p.verifierRewardShareBps);
        vm.serializeUint(paramsObj, "carelessVerifierSlashBps", p.carelessVerifierSlashBps);
        vm.serializeUint(paramsObj, "unrevealedPenaltyBps", p.unrevealedPenaltyBps);
        vm.serializeUint(paramsObj, "requiredArbiterApprovals", p.requiredArbiterApprovals);
        vm.serializeUint(paramsObj, "commitWindowSeconds", p.commitWindowSeconds);
        vm.serializeUint(paramsObj, "revealWindowSeconds", p.revealWindowSeconds);
        vm.serializeUint(paramsObj, "challengeWindowSeconds", p.challengeWindowSeconds);
        string memory paramsJson = vm.serializeUint(paramsObj, "withdrawalDelaySeconds", p.withdrawalDelaySeconds);
        vm.serializeString(obj, "parameters", paramsJson);

        vm.serializeAddress(obj, "verifiers", verifiers);
        string memory finalJson = vm.serializeAddress(obj, "arbiters", arbiters);

        vm.writeJson(finalJson, outputPath);
        console2.log("Deployment JSON written to:", outputPath);
    }

    function _findSubstring(bytes memory haystack, string memory needleStr, uint256 startOffset) internal pure returns (uint256) {
        bytes memory needle = bytes(needleStr);
        uint256 hLen = haystack.length;
        uint256 nLen = needle.length;
        require(hLen >= nLen + startOffset, "YAML key not found");
        for (uint256 i = startOffset; i <= hLen - nLen; ++i) {
            bool matchFound = true;
            for (uint256 j = 0; j < nLen; ++j) {
                if (haystack[i + j] != needle[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) return i + nLen;
        }
        revert("YAML key not found");
    }

    function _extractUintAfterKey(bytes memory yaml, string memory key, uint256 startOffset) internal pure returns (uint256) {
        uint256 pos = _findSubstring(yaml, key, startOffset);
        uint256 len = yaml.length;

        // Skip whitespace and opening quote
        while (pos < len && (yaml[pos] == 0x20 || yaml[pos] == 0x09 || yaml[pos] == 0x22)) {
            pos++;
        }

        uint256 result = 0;
        bool foundDigit = false;
        while (pos < len && uint8(yaml[pos]) >= 48 && uint8(yaml[pos]) <= 57) {
            result = result * 10 + (uint8(yaml[pos]) - 48);
            foundDigit = true;
            pos++;
        }
        require(foundDigit, "No uint value after YAML key");
        return result;
    }
}
