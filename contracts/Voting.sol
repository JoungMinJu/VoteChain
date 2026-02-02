pragma solidity ^0.8.20;

contract Voting {
    
    struct Proposal {
        string description;
        uint256 voteCount;
        bool exists;
    }

    address public owner;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => mapping(uint256 => bool)) public hasVoted;
    uint256 public proposalCount;

    event ProposalCreated(uint256 indexed proposalId, string description, uint256 timestamp);
    event VoteCast(address indexed voter, uint256 indexed proposalId, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    function createProposal(string memory _description) public {
        require(msg.sender == owner, "Only owner can create proposals");

        proposals[proposalCount] = Proposal({
            description: _description,
            voteCount: 0,
            exists: true
        });

        emit ProposalCreated(proposalCount, _description, block.timestamp);
        proposalCount++;
    }

    function vote(uint256 _proposalId) public {
        require(proposals[_proposalId].exists, "Proposal does not exist");
        require(!hasVoted[msg.sender][_proposalId], "Already voted");

        proposals[_proposalId].voteCount++;
        hasVoted[msg.sender][_proposalId] = true;

        emit VoteCast(msg.sender, _proposalId, block.timestamp);
    }

    function getProposal(uint256 _proposalId) public view returns ( 
        string memory description,
        uint256 voteCount,
        bool voted
    ) {
        require(proposals[_proposalId].exists, "Proposal does not exist");

        Proposal memory proposal = proposals[_proposalId];

        return (proposal.description, proposal.voteCount, hasVoted[msg.sender][_proposalId]);
    }

    function getProposalCount() public view returns (uint256) {
        return proposalCount;
    }
}