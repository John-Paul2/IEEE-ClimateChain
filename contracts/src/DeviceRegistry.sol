// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title DeviceRegistry
/// @notice Manages CEMS edge gateway device identities, uncompressed P-256 public keys, operator ownership, and status.
/// @dev Conforms to docs/INTERFACES.md Section 8.2. No upgradeable proxies.
contract DeviceRegistry is AccessControl, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    enum DeviceStatus {
        Unregistered,
        Active,
        Revoked
    }

    struct DeviceInfo {
        bytes32 installationId;
        address operator;
        bytes pubKeyP256; // 65-byte uncompressed SEC1 P-256 key (0x04 || X || Y)
        DeviceStatus status;
        uint64 registeredAt;
        uint64 updatedAt;
    }

    error DeviceAlreadyRegistered(bytes32 deviceId);
    error DeviceNotFound(bytes32 deviceId);
    error DeviceNotActive(bytes32 deviceId);
    error InvalidPublicKeyLength(uint256 length);
    error UnauthorizedCaller(address caller);
    error ZeroAddress();
    error InvalidIdentifier();

    event DeviceRegistered(
        bytes32 indexed deviceId,
        bytes32 indexed installationId,
        address indexed operator,
        bytes pubKeyP256
    );
    event DeviceKeyRotated(bytes32 indexed deviceId, bytes oldPubKeyP256, bytes newPubKeyP256);
    event DeviceRevoked(bytes32 indexed deviceId, address indexed revokedBy, string reason);
    event InstallationOperatorUpdated(bytes32 indexed installationId, address indexed operator);

    mapping(bytes32 => DeviceInfo) private _devices;
    mapping(bytes32 => address) public installationOperator;

    /// @notice Initializes the registry with an administrator address.
    /// @param admin The address granted DEFAULT_ADMIN_ROLE and ADMIN_ROLE.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    /// @notice Registers a new CEMS edge gateway device under an installation.
    /// @param deviceId Deterministic bytes32 identifier of the device (keccak256 of ASCII device_id).
    /// @param installationId Deterministic bytes32 identifier of the installation.
    /// @param operator Address of the plant operator responsible for this device.
    /// @param pubKeyP256 65-byte uncompressed SEC1 NIST P-256 public key (must begin with 0x04).
    function registerDevice(
        bytes32 deviceId,
        bytes32 installationId,
        address operator,
        bytes calldata pubKeyP256
    ) external whenNotPaused {
        if (operator == address(0)) revert ZeroAddress();
        if (deviceId == bytes32(0) || installationId == bytes32(0)) revert InvalidIdentifier();

        bool isAdmin = hasRole(ADMIN_ROLE, msg.sender);
        if (!isAdmin && msg.sender != operator) {
            revert UnauthorizedCaller(msg.sender);
        }

        address existingInstOp = installationOperator[installationId];
        if (existingInstOp != address(0) && existingInstOp != operator && !isAdmin) {
            revert UnauthorizedCaller(msg.sender);
        }

        if (_devices[deviceId].status != DeviceStatus.Unregistered) {
            revert DeviceAlreadyRegistered(deviceId);
        }

        _validatePublicKey(pubKeyP256);

        uint64 nowTs = uint64(block.timestamp);
        _devices[deviceId] = DeviceInfo({
            installationId: installationId,
            operator: operator,
            pubKeyP256: pubKeyP256,
            status: DeviceStatus.Active,
            registeredAt: nowTs,
            updatedAt: nowTs
        });

        if (existingInstOp != operator) {
            installationOperator[installationId] = operator;
            emit InstallationOperatorUpdated(installationId, operator);
        }

        _grantRole(OPERATOR_ROLE, operator);

        emit DeviceRegistered(deviceId, installationId, operator, pubKeyP256);
    }

    /// @notice Rotates the uncompressed P-256 public key of an active device.
    /// @param deviceId The registered device identifier.
    /// @param newPubKeyP256 New 65-byte uncompressed SEC1 P-256 public key (0x04 || X || Y).
    function rotateKey(bytes32 deviceId, bytes calldata newPubKeyP256) external whenNotPaused {
        DeviceInfo storage dev = _devices[deviceId];
        if (dev.status == DeviceStatus.Unregistered) revert DeviceNotFound(deviceId);
        if (dev.status != DeviceStatus.Active) revert DeviceNotActive(deviceId);
        if (msg.sender != dev.operator && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedCaller(msg.sender);
        }

        _validatePublicKey(newPubKeyP256);

        bytes memory oldKey = dev.pubKeyP256;
        dev.pubKeyP256 = newPubKeyP256;
        dev.updatedAt = uint64(block.timestamp);

        emit DeviceKeyRotated(deviceId, oldKey, newPubKeyP256);
    }

    /// @notice Permanently revokes an active device so it can no longer anchor batches.
    /// @param deviceId The registered device identifier.
    /// @param reason Human-readable revocation reason for audit logs.
    function revokeDevice(bytes32 deviceId, string calldata reason) external whenNotPaused {
        DeviceInfo storage dev = _devices[deviceId];
        if (dev.status == DeviceStatus.Unregistered) revert DeviceNotFound(deviceId);
        if (dev.status != DeviceStatus.Active) revert DeviceNotActive(deviceId);
        if (msg.sender != dev.operator && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert UnauthorizedCaller(msg.sender);
        }

        dev.status = DeviceStatus.Revoked;
        dev.updatedAt = uint64(block.timestamp);

        emit DeviceRevoked(deviceId, msg.sender, reason);
    }

    /// @notice Explicitly sets or updates the operator for an installation before or after device registration.
    /// @param installationId Deterministic bytes32 identifier of the installation.
    /// @param operator Operator address to associate with the installation.
    function setInstallationOperator(bytes32 installationId, address operator) external whenNotPaused {
        if (operator == address(0)) revert ZeroAddress();
        if (installationId == bytes32(0)) revert InvalidIdentifier();
        address existing = installationOperator[installationId];
        bool isAdmin = hasRole(ADMIN_ROLE, msg.sender);
        if (!isAdmin && !(existing == address(0) && msg.sender == operator) && existing != msg.sender) {
            revert UnauthorizedCaller(msg.sender);
        }
        installationOperator[installationId] = operator;
        _grantRole(OPERATOR_ROLE, operator);
        emit InstallationOperatorUpdated(installationId, operator);
    }

    /// @notice Returns the full metadata record for a device.
    /// @param deviceId The device identifier.
    /// @return DeviceInfo struct for the device.
    function getDevice(bytes32 deviceId) external view returns (DeviceInfo memory) {
        return _devices[deviceId];
    }

    /// @notice Checks whether a device is currently registered and active (not revoked).
    /// @param deviceId The device identifier.
    /// @return True if the device status is Active.
    function isDeviceActive(bytes32 deviceId) external view returns (bool) {
        return _devices[deviceId].status == DeviceStatus.Active;
    }

    /// @notice Returns the operator registered for an installation.
    /// @param installationId The installation identifier.
    /// @return The operator address (or address(0) if not set).
    function getInstallationOperator(bytes32 installationId) external view returns (address) {
        return installationOperator[installationId];
    }

    /// @notice Pauses state-mutating registry operations. Callable only by ADMIN_ROLE.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpauses state-mutating registry operations. Callable only by ADMIN_ROLE.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function _validatePublicKey(bytes calldata pubKeyP256) internal pure {
        if (pubKeyP256.length != 65 || pubKeyP256[0] != 0x04) {
            revert InvalidPublicKeyLength(pubKeyP256.length);
        }
    }
}
