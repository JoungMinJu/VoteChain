// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {
    // 선택지 구조체
    struct Option {
        string name;
        uint256 voteCount;
    }
    
    // 제안 구조체
    struct Proposal {
        string description;
        Option[] options;
        address creator;
        bool isActive;
        uint256 createdAt;
        mapping(address => bool) hasVoted;
        mapping(address => uint256) votedOption;
    }
    
    // 상태 변수
    mapping(uint256 => Proposal) public proposals;
    uint256 public proposalCount;
    
    // 이벤트
    event ProposalCreated(
        uint256 indexed proposalId, 
        string description, 
        address indexed creator,
        string[] options,
        uint256 timestamp
    );
    
    event VoteCast(
        address indexed voter, 
        uint256 indexed proposalId, 
        uint256 timestamp
    );
    
    event ProposalEnded(
        uint256 indexed proposalId,
        address indexed endedBy,
        uint256 timestamp
    );
    
    event OwnershipTransferred(
        uint256 indexed proposalId,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 timestamp
    );
    
    // 제안 생성 (누구나 가능, 생성자가 관리자가 됨)
    function createProposal(
        string memory _description,
        string[] memory _optionNames
    ) public {
        require(_optionNames.length >= 2, "At least 2 options required");
        require(_optionNames.length <= 10, "Maximum 10 options allowed");
        
        Proposal storage newProposal = proposals[proposalCount];
        newProposal.description = _description;
        newProposal.creator = msg.sender;
        newProposal.isActive = true;
        newProposal.createdAt = block.timestamp;
        
        // 선택지 추가
        for (uint256 i = 0; i < _optionNames.length; i++) {
            newProposal.options.push(Option({
                name: _optionNames[i],
                voteCount: 0
            }));
        }
        
        emit ProposalCreated(
            proposalCount, 
            _description, 
            msg.sender,
            _optionNames,
            block.timestamp
        );
        
        proposalCount++;
    }
    
    // 투표하기
    function vote(uint256 _proposalId, uint256 _optionIndex) public {
        Proposal storage proposal = proposals[_proposalId];
        
        require(_proposalId < proposalCount, "Proposal does not exist");
        require(proposal.isActive, "Proposal is not active");
        require(_optionIndex < proposal.options.length, "Invalid option");
        require(!proposal.hasVoted[msg.sender], "Already voted");
        
        proposal.options[_optionIndex].voteCount++;
        proposal.hasVoted[msg.sender] = true;
        proposal.votedOption[msg.sender] = _optionIndex;
        
        emit VoteCast(
            msg.sender, 
            _proposalId, 
            block.timestamp
        );
    }
    
    // 투표 종료 (관리자만 가능)
    function endProposal(uint256 _proposalId) public {
        Proposal storage proposal = proposals[_proposalId];
        
        require(_proposalId < proposalCount, "Proposal does not exist");
        require(proposal.creator == msg.sender, "Only creator can end proposal");
        require(proposal.isActive, "Proposal already ended");
        
        proposal.isActive = false;
        
        emit ProposalEnded(_proposalId, msg.sender, block.timestamp);
    }
    
    // 관리자 권한 이전 (현재 관리자만 가능)
    function transferOwnership(uint256 _proposalId, address _newOwner) public {
        Proposal storage proposal = proposals[_proposalId];
        
        require(_proposalId < proposalCount, "Proposal does not exist");
        require(proposal.creator == msg.sender, "Only creator can transfer ownership");
        require(_newOwner != address(0), "Invalid new owner");
        require(_newOwner != msg.sender, "Already the owner");
        
        address previousOwner = proposal.creator;
        proposal.creator = _newOwner;
        
        emit OwnershipTransferred(_proposalId, previousOwner, _newOwner, block.timestamp);
    }
    
    // 제안 정보 조회
    function getProposal(uint256 _proposalId) public view returns (
        string memory description,
        address creator,
        bool isActive,
        uint256 createdAt,
        bool hasVoted
    ) {
        require(_proposalId < proposalCount, "Proposal does not exist");
        
        Proposal storage proposal = proposals[_proposalId];
        return (
            proposal.description,
            proposal.creator,
            proposal.isActive,
            proposal.createdAt,
            proposal.hasVoted[msg.sender]
        );
    }
    
    // 선택지 목록 조회
    function getOptions(uint256 _proposalId) public view returns (
        string[] memory names,
        uint256[] memory voteCounts
    ) {
        require(_proposalId < proposalCount, "Proposal does not exist");
        
        Proposal storage proposal = proposals[_proposalId];
        uint256 optionCount = proposal.options.length;
        
        names = new string[](optionCount);
        voteCounts = new uint256[](optionCount);
        
        for (uint256 i = 0; i < optionCount; i++) {
            names[i] = proposal.options[i].name;
            voteCounts[i] = proposal.options[i].voteCount;
        }
        
        return (names, voteCounts);
    }
    
    // 사용자가 투표한 선택지 조회
    function getVotedOption(uint256 _proposalId, address _voter) public view returns (
        bool hasVoted,
        uint256 optionIndex,
        string memory optionName
    ) {
        require(_proposalId < proposalCount, "Proposal does not exist");
        
        Proposal storage proposal = proposals[_proposalId];
        
        if (!proposal.hasVoted[_voter]) {
            return (false, 0, "");
        }
        
        uint256 index = proposal.votedOption[_voter];
        return (true, index, proposal.options[index].name);
    }
    
    // 투표 현황 조회 (관리자용)
    function getProposalStats(uint256 _proposalId) public view returns (
        uint256 totalVotes,
        string[] memory optionNames,
        uint256[] memory voteCounts
    ) {
        require(_proposalId < proposalCount, "Proposal does not exist");
        
        Proposal storage proposal = proposals[_proposalId];
        uint256 optionCount = proposal.options.length;
        
        optionNames = new string[](optionCount);
        voteCounts = new uint256[](optionCount);
        totalVotes = 0;
        
        for (uint256 i = 0; i < optionCount; i++) {
            optionNames[i] = proposal.options[i].name;
            voteCounts[i] = proposal.options[i].voteCount;
            totalVotes += proposal.options[i].voteCount;
        }
        
        return (totalVotes, optionNames, voteCounts);
    }
}