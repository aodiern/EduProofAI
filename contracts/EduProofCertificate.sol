// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EduProof AI Certificate
/// @notice Non-transferable NFT-style certificates for verified academic works.
contract EduProofCertificate {
    string public constant name = "EduProof AI Certificate";
    string public constant symbol = "EDUPROOF";

    bytes4 private constant INTERFACE_ID_ERC165 = 0x01ffc9a7;
    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant INTERFACE_ID_ERC721_METADATA = 0x5b5e139f;

    uint16 public constant BPS = 10_000;
    uint16 public minScoreBps = 7_000;
    uint16 public burnBps = 3_500;
    uint16 public validatorBps = 4_000;
    uint16 public treasuryBps = 2_500;
    uint256 public immutable maxSupply;
    uint256 public tokenCounter;
    address public owner;

    struct Certificate {
        bytes32 studentHash;
        bytes32 workHash;
        bytes32 aiReportHash;
        string title;
        string metadataURI;
        uint16 scoreBps;
        address issuer;
        uint64 issuedAt;
        bool revoked;
    }

    mapping(address => bool) public issuers;
    mapping(bytes32 => bool) public usedWorkHashes;
    mapping(uint256 => address) private tokenOwners;
    mapping(address => uint256) private ownerBalances;
    mapping(uint256 => Certificate) private certificates;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event IssuerUpdated(address indexed issuer, bool allowed);
    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed studentWallet,
        address indexed issuer,
        bytes32 workHash,
        uint16 scoreBps
    );
    event CertificateRevoked(uint256 indexed tokenId, address indexed issuer, string reason);
    event TokenPolicyUpdated(uint16 burnBps, uint16 validatorBps, uint16 treasuryBps);

    error NotOwner();
    error NotIssuer();
    error ZeroAddress();
    error InvalidScore();
    error InvalidPolicy();
    error MaxSupplyReached();
    error DuplicateWorkHash();
    error TokenDoesNotExist();
    error NonTransferableCertificate();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyIssuer() {
        if (!issuers[msg.sender]) revert NotIssuer();
        _;
    }

    constructor(uint256 maxSupply_) {
        owner = msg.sender;
        issuers[msg.sender] = true;
        maxSupply = maxSupply_;
        emit IssuerUpdated(msg.sender, true);
    }

    function setIssuer(address issuer, bool allowed) external onlyOwner {
        if (issuer == address(0)) revert ZeroAddress();
        issuers[issuer] = allowed;
        emit IssuerUpdated(issuer, allowed);
    }

    function setMinScore(uint16 minScoreBps_) external onlyOwner {
        if (minScoreBps_ > BPS) revert InvalidScore();
        minScoreBps = minScoreBps_;
    }

    function setTokenPolicy(uint16 burnBps_, uint16 validatorBps_, uint16 treasuryBps_) external onlyOwner {
        if (burnBps_ + validatorBps_ + treasuryBps_ != BPS) revert InvalidPolicy();
        burnBps = burnBps_;
        validatorBps = validatorBps_;
        treasuryBps = treasuryBps_;
        emit TokenPolicyUpdated(burnBps_, validatorBps_, treasuryBps_);
    }

    function mintCertificate(
        address studentWallet,
        bytes32 studentHash,
        bytes32 workHash,
        bytes32 aiReportHash,
        string calldata title,
        string calldata metadataURI,
        uint16 scoreBps
    ) external onlyIssuer returns (uint256 tokenId) {
        if (studentWallet == address(0)) revert ZeroAddress();
        if (scoreBps < minScoreBps || scoreBps > BPS) revert InvalidScore();
        if (tokenCounter >= maxSupply) revert MaxSupplyReached();
        if (usedWorkHashes[workHash]) revert DuplicateWorkHash();

        tokenId = ++tokenCounter;
        usedWorkHashes[workHash] = true;
        tokenOwners[tokenId] = studentWallet;
        ownerBalances[studentWallet] += 1;

        certificates[tokenId] = Certificate({
            studentHash: studentHash,
            workHash: workHash,
            aiReportHash: aiReportHash,
            title: title,
            metadataURI: metadataURI,
            scoreBps: scoreBps,
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            revoked: false
        });

        emit Transfer(address(0), studentWallet, tokenId);
        emit CertificateMinted(tokenId, studentWallet, msg.sender, workHash, scoreBps);
    }

    function revokeCertificate(uint256 tokenId, string calldata reason) external {
        Certificate storage cert = certificates[tokenId];
        if (tokenOwners[tokenId] == address(0)) revert TokenDoesNotExist();
        if (msg.sender != cert.issuer && msg.sender != owner) revert NotIssuer();
        cert.revoked = true;
        emit CertificateRevoked(tokenId, msg.sender, reason);
    }

    function verifyCertificate(uint256 tokenId)
        external
        view
        returns (
            address studentWallet,
            bytes32 workHash,
            bytes32 aiReportHash,
            uint16 scoreBps,
            bool revoked,
            bool valid
        )
    {
        Certificate storage cert = certificates[tokenId];
        studentWallet = tokenOwners[tokenId];
        if (studentWallet == address(0)) revert TokenDoesNotExist();
        return (
            studentWallet,
            cert.workHash,
            cert.aiReportHash,
            cert.scoreBps,
            cert.revoked,
            !cert.revoked && cert.scoreBps >= minScoreBps
        );
    }

    function certificateOf(uint256 tokenId) external view returns (Certificate memory) {
        if (tokenOwners[tokenId] == address(0)) revert TokenDoesNotExist();
        return certificates[tokenId];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address tokenOwner = tokenOwners[tokenId];
        if (tokenOwner == address(0)) revert TokenDoesNotExist();
        return tokenOwner;
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return ownerBalances[account];
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (tokenOwners[tokenId] == address(0)) revert TokenDoesNotExist();
        return certificates[tokenId].metadataURI;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == INTERFACE_ID_ERC165
            || interfaceId == INTERFACE_ID_ERC721
            || interfaceId == INTERFACE_ID_ERC721_METADATA;
    }

    function approve(address, uint256) external pure {
        revert NonTransferableCertificate();
    }

    function setApprovalForAll(address, bool) external pure {
        revert NonTransferableCertificate();
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (tokenOwners[tokenId] == address(0)) revert TokenDoesNotExist();
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function feeSplit(uint256 feeAmount)
        external
        view
        returns (uint256 burnAmount, uint256 validatorReward, uint256 treasuryAmount)
    {
        burnAmount = (feeAmount * burnBps) / BPS;
        validatorReward = (feeAmount * validatorBps) / BPS;
        treasuryAmount = feeAmount - burnAmount - validatorReward;
    }

    function transferFrom(address, address, uint256) external pure {
        revert NonTransferableCertificate();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert NonTransferableCertificate();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert NonTransferableCertificate();
    }
}
