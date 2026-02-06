import { useState, useEffect } from 'react'
import { ethers } from 'ethers'

const VOTING_ABI = [
  "function proposalCount() view returns (uint256)",
  "function createProposal(string memory _description, string[] memory _optionNames)",
  "function vote(uint256 _proposalId, uint256 _optionIndex)",
  "function endProposal(uint256 _proposalId)",
  "function transferOwnership(uint256 _proposalId, address _newOwner)",
  "function getProposal(uint256 _proposalId) view returns (string description, address creator, bool isActive, uint256 createdAt, bool hasVoted)",
  "function getOptions(uint256 _proposalId) view returns (string[] names, uint256[] voteCounts)",
  "event ProposalCreated(uint256 indexed proposalId, string description, address indexed creator, string[] options, uint256 timestamp)",
  "event VoteCast(address indexed voter, uint256 indexed proposalId, uint256 optionIndex, string optionName, uint256 timestamp)",
  "event ProposalEnded(uint256 indexed proposalId, address indexed endedBy, uint256 timestamp)",
  "event OwnershipTransferred(uint256 indexed proposalId, address indexed previousOwner, address indexed newOwner, uint256 timestamp)"
]

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || ""
const RPC_URL = "https://sepolia-rpc.giwa.io"

function App() {
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [readContract, setReadContract] = useState(null) // 🔥 이벤트 구독 전용
  const [proposals, setProposals] = useState([])
  const [newProposal, setNewProposal] = useState({ description: '', options: ['', ''] })
  const [transferAddress, setTransferAddress] = useState({})
  const [loading, setLoading] = useState(false)
  const [notification, setNotification] = useState(null)

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 5000)
  }

  // 🔥 이벤트 리스닝 전용 Provider & Contract 생성
  useEffect(() => {
    // JSON-RPC Provider 생성 (폴링 간격 설정)
    const jsonRpcProvider = new ethers.JsonRpcProvider(RPC_URL, {
      chainId: 91342,
      name: 'giwa-sepolia'
    }, {
      polling: true,
      pollingInterval: 15000 // 🔥 15초마다 이벤트 체크
    })

    // Read-only 컨트랙트 (이벤트 구독용)
    const readOnlyContract = new ethers.Contract(
      CONTRACT_ADDRESS,
      VOTING_ABI,
      jsonRpcProvider
    )

    setReadContract(readOnlyContract)

    console.log('🎧 이벤트 리스닝 Provider 생성 완료')
    console.log('📡 Polling 간격: 15초')

    return () => {
      // Provider 정리
      jsonRpcProvider.destroy()
    }
  }, [])

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('MetaMask를 설치해주세요!')
        return
      }

      const accounts = await window.ethereum.request({ 
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }]
      }).then(() => window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      }))
      
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const writeContract = new ethers.Contract(CONTRACT_ADDRESS, VOTING_ABI, signer)

      setAccount(accounts[0])
      setContract(writeContract)
      
      showNotification('지갑이 연결되었습니다!')

      const network = await provider.getNetwork()
      if (network.chainId !== 91342n) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x164CE' }],
          })
        } catch (error) {
          if (error.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x164CE',
                chainName: 'Giwa Sepolia Testnet',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [RPC_URL],
                blockExplorerUrls: ['https://sepolia-explorer.giwa.io']
              }]
            })
          }
        }
      }
      
      await loadProposals(writeContract)
    } catch (error) {
      console.error('지갑 연결 오류:', error)
      if (error.code === 4001) {
        showNotification('지갑 연결이 취소되었습니다', 'error')
      } else {
        showNotification('지갑 연결에 실패했습니다', 'error')
      }
    }
  }

  // 제안 목록 불러오기
  const loadProposals = async (contractInstance = contract) => {
    if (!contractInstance && !readContract) return
    
    const activeContract = contractInstance || readContract

    try {
      setLoading(true)
      console.log('📊 제안 데이터 로드 중...')
      const count = await activeContract.proposalCount()
      const proposalList = []

      for (let i = 0; i < count; i++) {
        const [description, creator, isActive, createdAt, hasVoted] = await activeContract.getProposal(i)
        const [optionNames, voteCounts] = await activeContract.getOptions(i)
        
        proposalList.push({
          id: i,
          description,
          creator,
          isActive,
          createdAt: Number(createdAt),
          hasVoted,
          options: optionNames.map((name, idx) => ({
            name,
            voteCount: Number(voteCounts[idx])
          }))
        })
      }

      setProposals(proposalList)
      console.log('✅ 제안 데이터 로드 완료')
    } catch (error) {
      console.error('❌ 제안 로드 오류:', error)
    } finally {
      setLoading(false)
    }
  }

  const createProposal = async () => {
    if (!contract || !newProposal.description.trim()) return
    
    const validOptions = newProposal.options.filter(opt => opt.trim() !== '')
    if (validOptions.length < 2) {
      showNotification('최소 2개의 선택지가 필요합니다', 'error')
      return
    }

    try {
      setLoading(true)
      const tx = await contract.createProposal(newProposal.description, validOptions)
      await tx.wait()
      
      setNewProposal({ description: '', options: ['', ''] })
      showNotification('제안이 생성되었습니다!')
      await loadProposals()
    } catch (error) {
      console.error('제안 생성 오류:', error)
      showNotification('제안 생성에 실패했습니다', 'error')
    } finally {
      setLoading(false)
    }
  }

  const vote = async (proposalId, optionIndex) => {
    if (!contract) return

    try {
      setLoading(true)
      const tx = await contract.vote(proposalId, optionIndex)
      await tx.wait()
      
      showNotification('투표가 완료되었습니다!')
      await loadProposals()
    } catch (error) {
      console.error('투표 오류:', error)
      showNotification('투표에 실패했습니다', 'error')
    } finally {
      setLoading(false)
    }
  }

  const endProposal = async (proposalId) => {
    if (!contract) return

    try {
      setLoading(true)
      const tx = await contract.endProposal(proposalId)
      await tx.wait()
      
      showNotification('투표가 종료되었습니다!')
      await loadProposals()
    } catch (error) {
      console.error('투표 종료 오류:', error)
      showNotification('투표 종료에 실패했습니다', 'error')
    } finally {
      setLoading(false)
    }
  }

  const transferOwnership = async (proposalId) => {
    if (!contract || !transferAddress[proposalId]) return

    try {
      setLoading(true)
      const tx = await contract.transferOwnership(proposalId, transferAddress[proposalId])
      await tx.wait()
      
      showNotification('관리자 권한이 이전되었습니다!')
      setTransferAddress({ ...transferAddress, [proposalId]: '' })
      await loadProposals()
    } catch (error) {
      console.error('권한 이전 오류:', error)
      showNotification('권한 이전에 실패했습니다', 'error')
    } finally {
      setLoading(false)
    }
  }

  const addOption = () => {
    if (newProposal.options.length >= 10) {
      showNotification('최대 10개까지 추가 가능합니다', 'error')
      return
    }
    setNewProposal({
      ...newProposal,
      options: [...newProposal.options, '']
    })
  }

  const removeOption = (index) => {
    if (newProposal.options.length <= 2) {
      showNotification('최소 2개의 선택지가 필요합니다', 'error')
      return
    }
    const newOptions = newProposal.options.filter((_, i) => i !== index)
    setNewProposal({
      ...newProposal,
      options: newOptions
    })
  }

  const updateOption = (index, value) => {
    const newOptions = [...newProposal.options]
    newOptions[index] = value
    setNewProposal({
      ...newProposal,
      options: newOptions
    })
  }

  // 🔥🔥🔥 블록체인 이벤트 구독 (핵심!)
  useEffect(() => {
    if (!readContract) {
      console.log('⏳ readContract 아직 준비 안됨')
      return
    }

    console.log('🎧 이벤트 리스너 등록 시작...')

    // ProposalCreated 이벤트 구독
    const onProposalCreated = (proposalId, description, creator, options, timestamp, event) => {
      console.log('📢 [이벤트 감지] ProposalCreated:', {
        proposalId: proposalId.toString(),
        description,
        creator,
        options,
        blockNumber: event.log.blockNumber
      })
      
      const shortAddress = `${creator.slice(0, 6)}...${creator.slice(-4)}`
      showNotification(`🆕 ${shortAddress}님이 새 투표를 생성했습니다: "${description}"`)
      loadProposals()
    }

    // VoteCast 이벤트 구독 (가장 중요!)
    const onVoteCast = (voter, proposalId, optionIndex, optionName, timestamp, event) => {
      console.log('📢 [이벤트 감지] VoteCast:', {
        voter,
        proposalId: proposalId.toString(),
        optionIndex: optionIndex.toString(),
        optionName,
        blockNumber: event.log.blockNumber
      })
      
      const shortAddress = `${voter.slice(0, 6)}...${voter.slice(-4)}`
      showNotification(`🗳️ ${shortAddress}님이 "${optionName}"에 투표했습니다!`)
      loadProposals()
    }

    // ProposalEnded 이벤트 구독
    const onProposalEnded = (proposalId, endedBy, timestamp, event) => {
      console.log('📢 [이벤트 감지] ProposalEnded:', {
        proposalId: proposalId.toString(),
        endedBy,
        blockNumber: event.log.blockNumber
      })
      
      showNotification(`🔒 투표 #${proposalId}가 종료되었습니다`)
      loadProposals()
    }

    // OwnershipTransferred 이벤트 구독
    const onOwnershipTransferred = (proposalId, previousOwner, newOwner, timestamp, event) => {
      console.log('📢 [이벤트 감지] OwnershipTransferred:', {
        proposalId: proposalId.toString(),
        previousOwner,
        newOwner,
        blockNumber: event.log.blockNumber
      })
      
      showNotification(`👑 투표 #${proposalId}의 관리자가 변경되었습니다`)
      loadProposals()
    }

    // 🔥 이벤트 리스너 등록
    readContract.on('ProposalCreated', onProposalCreated)
    readContract.on('VoteCast', onVoteCast)
    readContract.on('ProposalEnded', onProposalEnded)
    readContract.on('OwnershipTransferred', onOwnershipTransferred)

    console.log('✅ 모든 이벤트 리스너 등록 완료!')
    console.log('📡 이제 블록체인 이벤트를 실시간으로 감지합니다')

    // Cleanup: 컴포넌트 언마운트 시 리스너 제거
    return () => {
      console.log('🧹 이벤트 리스너 제거 중...')
      readContract.off('ProposalCreated', onProposalCreated)
      readContract.off('VoteCast', onVoteCast)
      readContract.off('ProposalEnded', onProposalEnded)
      readContract.off('OwnershipTransferred', onOwnershipTransferred)
      console.log('✅ 이벤트 리스너 제거 완료')
    }
  }, [readContract])

  // 계정 변경 감지
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0])
          try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()
            const newContract = new ethers.Contract(CONTRACT_ADDRESS, VOTING_ABI, signer)
            setContract(newContract)
            showNotification('계정이 변경되었습니다')
            await loadProposals(newContract)
          } catch (error) {
            console.error('계정 변경 오류:', error)
          }
        } else {
          setAccount(null)
          setContract(null)
        }
      }

      window.ethereum.on('accountsChanged', handleAccountsChanged)
      
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      }
    }
  }, [])

  // 초기 데이터 로드
  useEffect(() => {
    if (readContract) {
      loadProposals()
    }
  }, [readContract])

  return (
    <div className="app">
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      <div className="header">
        <h1>🗳️ 탈중앙화 투표 시스템</h1>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
          📡 실시간 이벤트 구독 활성화 (15초 폴링)
        </div>
        {account ? (
          <div>
            <div className="wallet-info">
              연결된 지갑: {account.slice(0, 6)}...{account.slice(-4)}
            </div>
            <button 
              className="connect-btn" 
              onClick={connectWallet}
              style={{ 
                marginTop: '10px', 
                fontSize: '14px', 
                padding: '8px 16px',
                background: '#f59e0b'
              }}
            >
              🔄 계정 변경
            </button>
          </div>
        ) : (
          <button className="connect-btn" onClick={connectWallet}>
            MetaMask 연결
          </button>
        )}
      </div>

      {account && (
        <>
          <div className="create-proposal">
            <h2>새 투표 만들기</h2>
            <input
              type="text"
              placeholder="투표 제목을 입력하세요"
              value={newProposal.description}
              onChange={(e) => setNewProposal({ ...newProposal, description: e.target.value })}
              disabled={loading}
            />
            
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ marginBottom: '10px', fontSize: '16px' }}>선택지 (최소 2개, 최대 10개)</h3>
              {newProposal.options.map((option, index) => (
                <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder={`선택지 ${index + 1}`}
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    disabled={loading}
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                  {newProposal.options.length > 2 && (
                    <button 
                      onClick={() => removeOption(index)}
                      disabled={loading}
                      style={{ 
                        padding: '10px 20px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
              
              {newProposal.options.length < 10 && (
                <button 
                  onClick={addOption}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginBottom: '10px'
                  }}
                >
                  + 선택지 추가
                </button>
              )}
            </div>

            <button 
              className="create-btn" 
              onClick={createProposal}
              disabled={loading || !newProposal.description.trim()}
            >
              {loading ? '생성 중...' : '투표 생성'}
            </button>
          </div>

          {loading && proposals.length === 0 ? (
            <div className="loading">투표를 불러오는 중...</div>
          ) : (
            <div className="proposals">
              {proposals.map((proposal) => {
                const isCreator = account && proposal.creator.toLowerCase() === account.toLowerCase()
                const totalVotes = proposal.options.reduce((sum, opt) => sum + opt.voteCount, 0)
                
                return (
                  <div key={proposal.id} className="proposal-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                      <h3>투표 #{proposal.id}</h3>
                      {!proposal.isActive && (
                        <span style={{ 
                          background: '#ef4444', 
                          color: 'white', 
                          padding: '4px 12px', 
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          종료됨
                        </span>
                      )}
                    </div>
                    
                    <p style={{ marginBottom: '10px' }}>{proposal.description}</p>
                    
                    <div style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
                      관리자: {proposal.creator.slice(0, 6)}...{proposal.creator.slice(-4)}
                      {isCreator && <span style={{ color: '#10b981', marginLeft: '8px' }}>👑 나</span>}
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                        총 투표수: {totalVotes}
                      </div>
                      
                      {proposal.options.map((option, idx) => {
                        const percentage = totalVotes > 0 ? (option.voteCount / totalVotes * 100).toFixed(1) : 0
                        
                        return (
                          <div key={idx} style={{ marginBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '14px' }}>{option.name}</span>
                              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#667eea' }}>
                                {option.voteCount}표 ({percentage}%)
                              </span>
                            </div>
                            <div style={{ 
                              width: '100%', 
                              height: '8px', 
                              background: '#e5e7eb', 
                              borderRadius: '4px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${percentage}%`,
                                height: '100%',
                                background: '#667eea',
                                transition: 'width 0.3s'
                              }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {proposal.hasVoted ? (
                      <div className="voted-badge">✓ 투표 완료</div>
                    ) : proposal.isActive ? (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {proposal.options.map((option, idx) => (
                          <button 
                            key={idx}
                            className="vote-btn" 
                            onClick={() => vote(proposal.id, idx)}
                            disabled={loading}
                          >
                            {option.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ 
                        padding: '10px', 
                        background: '#fee2e2', 
                        color: '#991b1b',
                        borderRadius: '6px',
                        textAlign: 'center'
                      }}>
                        투표가 종료되었습니다
                      </div>
                    )}

                    {isCreator && proposal.isActive && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                        <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>👑 관리자 메뉴</h4>
                        
                        <button
                          onClick={() => endProposal(proposal.id)}
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            marginBottom: '10px',
                            fontWeight: '600'
                          }}
                        >
                          투표 종료하기
                        </button>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            placeholder="새 관리자 주소 (0x...)"
                            value={transferAddress[proposal.id] || ''}
                            onChange={(e) => setTransferAddress({ ...transferAddress, [proposal.id]: e.target.value })}
                            style={{
                              flex: 1,
                              padding: '10px',
                              border: '2px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '14px'
                            }}
                          />
                          <button
                            onClick={() => transferOwnership(proposal.id)}
                            disabled={loading || !transferAddress[proposal.id]}
                            style={{
                              padding: '10px 16px',
                              background: '#f59e0b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            권한 이전
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App