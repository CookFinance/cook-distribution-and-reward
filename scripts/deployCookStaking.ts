import { ethers,network } from "hardhat";
import { ContractTransaction } from "ethers";
import { MockCOOK } from "../typechain/MockCOOK";
import { RewardVesting } from "../typechain/RewardVesting";
import { StakingPools } from "../typechain/StakingPools";
import { BigNumber } from "@ethersproject/bignumber";
import { JsonRpcSigner } from "@ethersproject/providers/src.ts/json-rpc-provider";


const ERC20ABI = [ { constant: true, inputs: [], name: "name", outputs: [{ name: "", type: "string" }], payable: false, stateMutability: "view", type: "function", }, { constant: false, inputs: [ { name: "_spender", type: "address" }, { name: "_value", type: "uint256" }, ], name: "approve", outputs: [{ name: "", type: "bool" }], payable: false, stateMutability: "nonpayable", type: "function", }, { constant: true, inputs: [], name: "totalSupply", outputs: [{ name: "", type: "uint256" }], payable: false, stateMutability: "view", type: "function", }, { constant: false, inputs: [ { name: "_from", type: "address" }, { name: "_to", type: "address" }, { name: "_value", type: "uint256" }, ], name: "transferFrom", outputs: [{ name: "", type: "bool" }], payable: false, stateMutability: "nonpayable", type: "function", }, { constant: true, inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], payable: false, stateMutability: "view", type: "function", }, { constant: true, inputs: [{ name: "_owner", type: "address" }], name: "balanceOf", outputs: [{ name: "balance", type: "uint256" }], payable: false, stateMutability: "view", type: "function", }, { constant: true, inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], payable: false, stateMutability: "view", type: "function", }, { constant: false, inputs: [ { name: "_to", type: "address" }, { name: "_value", type: "uint256" }, ], name: "transfer", outputs: [{ name: "", type: "bool" }], payable: false, stateMutability: "nonpayable", type: "function", }, { constant: true, inputs: [ { name: "_owner", type: "address" }, { name: "_spender", type: "address" }, ], name: "allowance", outputs: [{ name: "", type: "uint256" }], payable: false, stateMutability: "view", type: "function", }, { payable: true, stateMutability: "payable", type: "fallback" }, { anonymous: false, inputs: [ { indexed: true, name: "owner", type: "address" }, { indexed: true, name: "spender", type: "address" }, { indexed: false, name: "value", type: "uint256" }, ], name: "Approval", type: "event", }, { anonymous: false, inputs: [ { indexed: true, name: "from", type: "address" }, { indexed: true, name: "to", type: "address" }, { indexed: false, name: "value", type: "uint256" }, ], name: "Transfer", type: "event", }, ];
const STAKINGPOOLABI = [{"inputs":[{"internalType":"contract IMintableERC20","name":"_reward","type":"address"},{"internalType":"address","name":"_governance","type":"address"},{"internalType":"address","name":"_sentinel","type":"address"},{"internalType":"contract IRewardVesting","name":"_rewardVesting","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"governance","type":"address"}],"name":"GovernanceUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"oldLockPeriodInSecs","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"newLockPeriodInSecs","type":"uint256"}],"name":"LockUpPeriodInSecsUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"referral","type":"address"},{"indexed":false,"internalType":"address","name":"referee","type":"address"}],"name":"NewReferralAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"bool","name":"status","type":"bool"}],"name":"PauseUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"pendingGovernance","type":"address"}],"name":"PendingGovernanceUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"},{"indexed":true,"internalType":"contract IERC20","name":"token","type":"address"},{"indexed":false,"internalType":"uint256","name":"vestingDurationInSecs","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"depositLockPeriodInSecs","type":"uint256"}],"name":"PoolCreated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"rewardWeight","type":"uint256"}],"name":"PoolRewardWeightUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"rewardRate","type":"uint256"}],"name":"RewardRateUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"contract IRewardVesting","name":"rewardVesting","type":"address"}],"name":"RewardVestingUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sentinel","type":"address"}],"name":"SentinelUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"}],"name":"StartPoolReferralCompetition","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"}],"name":"StopPoolReferralCompetition","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"TokensClaimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"TokensDeposited","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"TokensWithdrawn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"poolId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"oldDurationInSecs","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"newDurationInSecs","type":"uint256"}],"name":"VestingDurationInSecsUpdated","type":"event"},{"inputs":[],"name":"SECONDS_PER_DAY","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"acceptGovernance","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"_token","type":"address"},{"internalType":"bool","name":"_needVesting","type":"bool"},{"internalType":"uint256","name":"_vestingDurationInSecs","type":"uint256"},{"internalType":"uint256","name":"_depositLockPeriodInSecs","type":"uint256"}],"name":"createPool","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"},{"internalType":"uint256","name":"_depositAmount","type":"uint256"},{"internalType":"address","name":"referral","type":"address"}],"name":"deposit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"exit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_referral","type":"address"},{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getAccumulatedReferralPower","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getPoolLockPeriodInSecs","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"},{"internalType":"uint256","name":"_referralIndex","type":"uint256"}],"name":"getPoolReferral","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getPoolRewardRate","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getPoolRewardWeight","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getPoolToken","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getPoolTotalDeposited","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getPoolTotalReferralAmount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getPoolVestingDurationInSecs","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"},{"internalType":"address","name":"referral","type":"address"}],"name":"getPoolreferee","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_account","type":"address"},{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getStakeTotalDeposited","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_account","type":"address"},{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"getStakeTotalUnclaimed","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"},{"internalType":"address","name":"_account","type":"address"}],"name":"getUserDeposits","outputs":[{"components":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"}],"internalType":"struct Deposit[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"},{"internalType":"address","name":"_account","type":"address"}],"name":"getWithdrawableAmount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"governance","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"isPoolReferralProgramOn","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"myReferral","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"myreferees","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"nextReferral","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pause","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pendingGovernance","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"poolCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"referralIsKnown","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"referralList","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"reward","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rewardRate","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rewardVesting","outputs":[{"internalType":"contract IRewardVesting","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"sentinel","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bool","name":"_pause","type":"bool"}],"name":"setPause","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_pendingGovernance","type":"address"}],"name":"setPendingGovernance","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"},{"internalType":"uint256","name":"_newLockUpPeriodInSecs","type":"uint256"}],"name":"setPoolLockUpPeriodInSecs","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"},{"internalType":"uint256","name":"_newVestingDurationInSecs","type":"uint256"}],"name":"setPoolVestingDurationInSecs","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_rewardRate","type":"uint256"}],"name":"setRewardRate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IRewardVesting","name":"_rewardVesting","type":"address"}],"name":"setRewardVesting","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256[]","name":"_rewardWeights","type":"uint256[]"}],"name":"setRewardWeights","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_sentinel","type":"address"}],"name":"setSentinel","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"startReferralBonus","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"}],"name":"stoptReferralBonus","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"name":"tokenPoolIds","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalRewardWeight","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"_poolId","type":"uint256"},{"internalType":"uint256","name":"_withdrawAmount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}]
const REWARDVESTINGABI = [{"inputs":[{"internalType":"address","name":"_governance","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"EarningAdd","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"penaltyAmount","type":"uint256"}],"name":"EarningWithdraw","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"governance","type":"address"}],"name":"GovernanceUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"pendingGovernance","type":"address"}],"name":"PendingGovernanceUpdated","type":"event"},{"inputs":[],"name":"acceptGovernance","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"accumulatedPenalty","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"durationInSecs","type":"uint256"}],"name":"addEarning","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"duration","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"earnedBalances","outputs":[{"internalType":"uint256","name":"total","type":"uint256"},{"internalType":"uint256[2][]","name":"earningsData","type":"uint256[2][]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"governance","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"_reward","type":"address"},{"internalType":"address","name":"_rewardSource","type":"address"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"pendingGovernance","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"reward","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rewardSource","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_pendingGovernance","type":"address"}],"name":"setPendingGovernance","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"transferTo","type":"address"}],"name":"transferPenalty","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"userBalances","outputs":[{"internalType":"uint256","name":"earned","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdrawEarning","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"withdrawableEarning","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"penaltyAmount","type":"uint256"},{"internalType":"uint256","name":"amountWithoutPenalty","type":"uint256"}],"stateMutability":"view","type":"function"}]
const issuanceModuleABI = [{"inputs":[{"internalType":"contract IController","name":"_controller","type":"address"},{"internalType":"contract IWETH","name":"_weth","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_component","type":"address"},{"indexed":false,"internalType":"string","name":"_newExchangeName","type":"string"}],"name":"AssetExchangeExecutionParamUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_component","type":"address"},{"indexed":false,"internalType":"string","name":"_newWrapAdapterName","type":"string"},{"indexed":false,"internalType":"address","name":"_newUnderlyingToken","type":"address"}],"name":"AssetWrapExecutionParamUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_ckToken","type":"address"},{"indexed":false,"internalType":"address","name":"_issuer","type":"address"},{"indexed":false,"internalType":"address","name":"_to","type":"address"},{"indexed":false,"internalType":"address","name":"_hookContract","type":"address"},{"indexed":false,"internalType":"uint256","name":"_ckMintQuantity","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_issuedTokenReturned","type":"uint256"}],"name":"CKTokenIssued","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_ckToken","type":"address"},{"indexed":false,"internalType":"address","name":"_redeemer","type":"address"},{"indexed":false,"internalType":"address","name":"_to","type":"address"},{"indexed":false,"internalType":"uint256","name":"_quantity","type":"uint256"}],"name":"CKTokenRedeemed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"indexed":true,"internalType":"address","name":"_sendToken","type":"address"},{"indexed":true,"internalType":"address","name":"_receiveToken","type":"address"},{"indexed":false,"internalType":"contract IExchangeAdapter","name":"_exchangeAdapter","type":"address"},{"indexed":false,"internalType":"uint256","name":"_totalSendAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_totalReceiveAmount","type":"uint256"}],"name":"ComponentExchanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"indexed":true,"internalType":"address","name":"_underlyingToken","type":"address"},{"indexed":true,"internalType":"address","name":"_wrappedToken","type":"address"},{"indexed":false,"internalType":"uint256","name":"_underlyingQuantity","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_wrappedQuantity","type":"uint256"},{"indexed":false,"internalType":"string","name":"_integrationName","type":"string"}],"name":"ComponentUnwrapped","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"indexed":true,"internalType":"address","name":"_underlyingToken","type":"address"},{"indexed":true,"internalType":"address","name":"_wrappedToken","type":"address"},{"indexed":false,"internalType":"uint256","name":"_underlyingQuantity","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_wrappedQuantity","type":"uint256"},{"indexed":false,"internalType":"string","name":"_integrationName","type":"string"}],"name":"ComponentWrapped","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"inputs":[],"name":"controller","outputs":[{"internalType":"contract IController","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"name":"exchangeInfo","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"internalType":"uint256","name":"_quantity","type":"uint256"},{"internalType":"bool","name":"_isIssue","type":"bool"}],"name":"getRequiredComponentIssuanceUnits","outputs":[{"internalType":"address[]","name":"","type":"address[]"},{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"internalType":"contract IManagerIssuanceHook","name":"_preIssueHook","type":"address"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"internalType":"uint256","name":"_slippage","type":"uint256"},{"internalType":"address","name":"_to","type":"address"},{"internalType":"bool","name":"_returnDust","type":"bool"}],"name":"issueWithEther","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"internalType":"uint256","name":"_minCkTokenRec","type":"uint256"},{"internalType":"uint256[]","name":"_weightings","type":"uint256[]"},{"internalType":"address","name":"_to","type":"address"},{"internalType":"bool","name":"_returnDust","type":"bool"}],"name":"issueWithEther2","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"internalType":"address","name":"_issueToken","type":"address"},{"internalType":"uint256","name":"_issueTokenQuantity","type":"uint256"},{"internalType":"uint256","name":"_slippage","type":"uint256"},{"internalType":"address","name":"_to","type":"address"},{"internalType":"bool","name":"_returnDust","type":"bool"}],"name":"issueWithSingleToken","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"internalType":"address","name":"_issueToken","type":"address"},{"internalType":"uint256","name":"_issueTokenQuantity","type":"uint256"},{"internalType":"uint256","name":"_minCkTokenRec","type":"uint256"},{"internalType":"uint256[]","name":"_weightings","type":"uint256[]"},{"internalType":"address","name":"_to","type":"address"},{"internalType":"bool","name":"_returnDust","type":"bool"}],"name":"issueWithSingleToken2","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract ICKToken","name":"","type":"address"}],"name":"managerIssuanceHook","outputs":[{"internalType":"contract IManagerIssuanceHook","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract ICKToken","name":"_ckToken","type":"address"},{"internalType":"uint256","name":"_ckTokenQuantity","type":"uint256"},{"internalType":"address","name":"_redeemToken","type":"address"},{"internalType":"address","name":"_to","type":"address"}],"name":"redeemToSingleToken","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"removeModule","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address[]","name":"_components","type":"address[]"},{"internalType":"string[]","name":"_exchangeNames","type":"string[]"}],"name":"setExchanges","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address[]","name":"_components","type":"address[]"},{"internalType":"string[]","name":"_wrapAdapterNames","type":"string[]"},{"internalType":"address[]","name":"_underlyingTokens","type":"address[]"}],"name":"setWrapAdapters","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"weth","outputs":[{"internalType":"contract IWETH","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"name":"wrapInfo","outputs":[{"internalType":"string","name":"wrapAdapterName","type":"string"},{"internalType":"address","name":"underlyingToken","type":"address"}],"stateMutability":"view","type":"function"}]

export function hre() {
  return require("hardhat");
}

async function main() {
    console.log("=========== Avalanche Farming Deployment Start ===========")
    // await run("compile");

    const [
      depositor1,
      depositor2,
      depositor3,
      depositor4,
      referral2,
      referral3,
      ...signers
    ] = await ethers.getSigners();
    
    const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    const COOK_ADDRESS = "0xff75ced57419bcaebe5f05254983b013b0646ef5";
    const UNISWAP_ROUTER_ADDRESS = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
    const UNISWAP_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    const Cook_Address = "0x637afeff75ca669ff92e4570b14d6399a658902f"
    const Cook_WAVA = "0x3fcd1d5450e63fa6af495a601e6ea1230f01c4e3"
    const ADMIN_ADDRESS = "0x121863dB810cdafE1B431BCCB20074bcCCCb6C3c"
    const YB_SCI = await ethers.getContractAt(ERC20ABI, "0x1967514beb1464857b54aa3e6cbe4fc7d245fa40")
    const AEI = await ethers.getContractAt(ERC20ABI, "0xd3b4a602df2a3abdc0ca241674bcd7566aba4d93")
    const YB_CMI = await ethers.getContractAt(ERC20ABI, "0x6f4a6a855412635668d9ebc69977870a637882ce")
    const cook = await ethers.getContractAt(ERC20ABI, Cook_Address)
    const cook_wava = await ethers.getContractAt(ERC20ABI, Cook_WAVA)


    const toTokenUnitsBN = (tokenAmount: BigNumber, tokenDecimals: number) => {
      const amt = BigNumber.from(tokenAmount);
      const digits = BigNumber.from(10).pow(BigNumber.from(tokenDecimals));
      return amt.div(digits).toNumber();
    }    

    const ether = (amount: number | string): BigNumber => {
      const weiString = ethers.utils.parseEther(amount.toString());
      return BigNumber.from(weiString);
    };

    console.log("============== cook address ==============:", cook.address)

    /**
     * Deploy reward vesting
     */
    // const rewardVesting = (await RewardVestingFactory.connect(cookLPDeployer).deploy(cookLPDeployer.address)) as RewardVesting;
    // await rewardVesting.deployed();
    const stakingPools = await ethers.getContractAt(STAKINGPOOLABI, "0x35bE7982bC5E40A8C9aF39A639bDDcE32081102e")
    const rewardVesting = await ethers.getContractAt(REWARDVESTINGABI, "0x7B800c1E5Ed4f57A4DD592Bd49e429422b8e9e72")


    await network.provider.request({ method: "hardhat_impersonateAccount", params: ["0x121863dB810cdafE1B431BCCB20074bcCCCb6C3c"] });
    const cookRewardAdmin = await ethers.provider.getSigner("0x121863dB810cdafE1B431BCCB20074bcCCCb6C3c");
    // await cook.mint(depositor1.address, "100000000000000000000000000");
    // await cook.mint(stakingPools.address, "100000000000000000000000000");  
    const Cook_holder_address = "0xcea9ff6c4d0024fd3e8c996fa0bfdc10333ae3d3"
    const lp_holder_address = "0xAb0F4fC0f3C5427fc3ee19DB15dB071276d4c267"
    // console.log("======= Staking program  deployed ======= : ", stakingPools.address);
    // const txn = await rewardVesting.connect(cookLPDeployer).initialize(cook.address, stakingPools.address);
    // await txn.wait()
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [Cook_holder_address] });
    const cookHolder = await ethers.provider.getSigner(Cook_holder_address);

    await network.provider.request({ method: "hardhat_impersonateAccount", params: [lp_holder_address] });
    const LpHolder = await ethers.provider.getSigner(lp_holder_address);
    const LPBalance = await cook_wava.balanceOf(LpHolder._address);
    console.log(LPBalance);
    const accounts = await ethers.getSigners();
    await accounts[0].sendTransaction({to: cookRewardAdmin._address, value: ether(1000)});
    await accounts[0].sendTransaction({to: cookHolder._address, value: ether(1000)});
    await accounts[0].sendTransaction({to: LpHolder._address, value: ether(1000)});

    console.log("about to start");
    
    // Set reward
    await stakingPools.connect(cookRewardAdmin).setPause(true);
    console.log("set pause successfully");
    const rewardRate = ether(49.50755116);      
    let txn = await stakingPools.connect(cookRewardAdmin).setRewardRate(rewardRate);
    console.log("set reward rate successfully");
    await txn.wait()

    txn = await stakingPools.connect(cookRewardAdmin).setRewardWeights([364, 1897, 5338, 1601, 801]);
    console.log("set reward weighting successfully");
    await txn.wait()
    await stakingPools.connect(cookRewardAdmin).setPause(false);
    console.log("Set reward rate successfully")

    // approve and deposit
    await cook.connect(cookHolder).approve(stakingPools.address, ether(400000))
    await stakingPools.connect(cookHolder).deposit(0, ether(400000), ZERO_ADDRESS)
    console.log("Staked Cook");

    await cook_wava.connect(LpHolder).approve(stakingPools.address, LPBalance)
    await stakingPools.connect(LpHolder).deposit(1, LPBalance, ZERO_ADDRESS)
    console.log("Staked Cook-WAVAX");

    // issue index tokens
    const issuanceModule = await ethers.getContractAt(issuanceModuleABI, "0xa191074fe860cf39de88679a9d66b8d10a540910")
    await issuanceModule.connect(depositor2).issueWithEther2(YB_CMI.address, 0, [ether(0.6), ether(0.4)], depositor2.address, true, {value: ether(5000)});
    console.log("successfully issued yield bearing mega cap index: ", await YB_CMI.balanceOf(depositor2.address));
    await issuanceModule.connect(depositor3).issueWithEther2(YB_SCI.address, 0, [ether(0.3), ether(0.3), ether(0.3), ether(0.1)], depositor3.address, true, {value: ether(5000)});
    console.log("successfully issued yield bearing stable coin index", await YB_SCI.balanceOf(depositor3.address));
    await issuanceModule.connect(depositor4).issueWithEther2(AEI.address, 0, [ether(0.3), ether(0.2), ether(0.09), ether(0.09), ether(0.09), ether(0.09), ether(0.09)], depositor4.address, true, {value: ether(5000)});
    console.log("successfully issued AEI index", await AEI.balanceOf(depositor4.address));

    const ybcmiBalancee = await YB_CMI.balanceOf(depositor2.address);
    const ybsciBalancee = await YB_SCI.balanceOf(depositor3.address);
    const aeiBalancee = await AEI.balanceOf(depositor4.address);

    // Approve and deposit ckTokens
    // 0: cook, 1: cook-ava, 2: YB-SCI 3: YB-MCI 4: AEI
    await AEI.connect(depositor4).approve(stakingPools.address, aeiBalancee); 
    await stakingPools.connect(depositor4).deposit(4, aeiBalancee , ZERO_ADDRESS);
    console.log("staked AEI")
    await YB_CMI.connect(depositor2).approve(stakingPools.address, ybcmiBalancee); 
    await stakingPools.connect(depositor2).deposit(3, ybcmiBalancee , ZERO_ADDRESS);
    console.log("staked YB_CMI")
    await YB_SCI.connect(depositor3).approve(stakingPools.address, ybsciBalancee); 
    await stakingPools.connect(depositor3).deposit(2, ybsciBalancee , ZERO_ADDRESS);
    console.log("staked AEI")

        // // For testing vesrting reward
    for (var i = 0; i < 5; i++) {
        for (var j = 0; j < 50; j++) {
            await hre().network.provider.send("evm_mine", [])
        }
        await stakingPools.connect(cookHolder).claim(0);
        await stakingPools.connect(LpHolder).claim(1);
        await hre().network.provider.send("evm_increaseTime", [86400 * 30]); 
    }

    // const cliPoolLockupPeriod_AEI = await stakingPools.connect(cookLPDeployer).getPoolLockPeriodInSecs(0);
    // const cliPoolVestingDuration_AEI = await stakingPools.connect(cookLPDeployer).getPoolVestingDurationInSecs(0)
    // console.log("================ pool AEI lockup period  ================:", cliPoolLockupPeriod_AEI.toNumber())
    // console.log("================ pool AEI vesting period  ================:", cliPoolVestingDuration_AEI.toNumber())

    // const cookPoolLockupPeriod_MCI = await stakingPools.connect(cookLPDeployer).getPoolLockPeriodInSecs(1);
    // const cookPoolVestingDuration_MCI = await stakingPools.connect(cookLPDeployer).getPoolVestingDurationInSecs(1)
    // console.log("================ pool MCI lockup period  ================:", cookPoolLockupPeriod_MCI.toNumber())
    // console.log("================ pool MCI vesting period  ================:", cookPoolVestingDuration_MCI.toNumber())

    // const cookPoolLockupPeriod_SCI = await stakingPools.connect(cookLPDeployer).getPoolLockPeriodInSecs(1);
    // const cookPoolVestingDuration_SCI = await stakingPools.connect(cookLPDeployer).getPoolVestingDurationInSecs(1)
    // console.log("================ pool SCI lockup period  ================:", cookPoolLockupPeriod_SCI.toNumber())
    // console.log("================ pool SCI vesting period  ================:", cookPoolVestingDuration_SCI.toNumber())

    // const cookPoolLockupPeriod_CooK = await stakingPools.connect(cookLPDeployer).getPoolLockPeriodInSecs(1);
    // const cookPoolVestingDuration_Cook = await stakingPools.connect(cookLPDeployer).getPoolVestingDurationInSecs(1)
    // console.log("================ pool Cook lockup period  ================:", cookPoolLockupPeriod_CooK.toNumber())
    // console.log("================ pool Cook vesting period  ================:", cookPoolVestingDuration_Cook.toNumber())

    // const issuanceModule = await ethers.getContractAt(issuanceModuleABI, "0xa191074fe860cf39de88679a9d66b8d10a540910")

    // // issue CkTokens
    // await issuanceModule.connect(depositor1).issueWithEther2(YB_CMI.address, 0, [ether(0.6), ether(0.4)], depositor1.address, true, {value: ether(500)});
    // console.log("successfully issued yield bearing mega cap index: ", await YB_CMI.balanceOf(depositor1.address));
    // await issuanceModule.connect(depositor1).issueWithEther2(YB_SCI.address, 0, [ether(0.3), ether(0.3), ether(0.3), ether(0.1)], depositor1.address, true, {value: ether(500)});
    // console.log("successfully issued yield bearing stable coin index", await YB_SCI.balanceOf(depositor1.address));
    // await issuanceModule.connect(depositor1).issueWithEther2(AEI.address, 0, [ether(0.3), ether(0.2), ether(0.09), ether(0.09), ether(0.09), ether(0.09), ether(0.09)], depositor1.address, true, {value: ether(500)});
    // console.log("successfully issued AEI index", await AEI.balanceOf(depositor1.address));

    // const aeiBalancee = await AEI.balanceOf(depositor1.address);
    // const ybcmiBalancee = await YB_CMI.balanceOf(depositor1.address);
    // const ybsciBalancee = await YB_SCI.balanceOf(depositor1.address);

    // const aeiBalancee = await AEI.balanceOf(depositor1.address);
    // const ybcmiBalancee = await YB_CMI.balanceOf(depositor1.address);
    // const ybsciBalancee = await YB_SCI.balanceOf(depositor1.address);

    // Approve and deposit ckTokens
    // 0: cook, 1: cook-ava, 2: YB-SCI 3: YB-MCI 4: AEI
    // await AEI.connect(depositor1).approve(stakingPool.address, aeiBalancee); 
    // await stakingPool.connect(depositor1).deposit(4, aeiBalancee , ZERO_ADDRESS);
    // console.log("staked AEI")
    // await YB_CMI.connect(depositor1).approve(stakingPool.address, ybcmiBalancee); 
    // await stakingPool.connect(depositor1).deposit(3, ybcmiBalancee , ZERO_ADDRESS);
    // console.log("staked YB_CMI")
    // await YB_SCI.connect(depositor1).approve(stakingPool.address, ybsciBalancee); 
    // await stakingPool.connect(depositor1).deposit(2, ybsciBalancee , ZERO_ADDRESS);
    // console.log("staked AEI")



    console.log("=== deployment completed ===")

    // // For testing referral
    // for (var i = 0; i < depositors.length; i++) {
    //   await cli.mint(depositors[i].address, "100000000000000000000000000");
    //   await cli.connect(depositors[i]).approve(stakingPools.address, "100000000000000000000000000");
    //   const amount = ethers.utils.parseEther((i + 1).toString())
    //   await stakingPools.connect(depositors[i]).deposit(0, amount , referrals[i].address);

    //   await cook.mint(depositors[i].address, "100000000000000000000000000");
    //   await cook.connect(depositors[i]).approve(stakingPools.address, "100000000000000000000000000");
    //   await stakingPools.connect(depositors[i]).deposit(1, amount , ZERO_ADDRESS);

    //   for (var j = 0; j < 50; j++) {
    //     await hre().network.provider.send("evm_mine", []);
    //   }
    // }

    // for (var i = 0; i < depositors.length; i++) {
    //   await stakingPools.connect(depositors[i]).claim(0);      
    //   await stakingPools.connect(depositors[i]).claim(1);
    // }

    // await hre().network.provider.send("evm_increaseTime", [86400 * 15]); 
    // await hre().network.provider.send("evm_mine", []);

    // const numOfReferrals = stakingPools.connect(cookLPDeployer).nextReferral(0);
    // console.log("====== pool 0 referrals: ======", (await numOfReferrals).toNumber())

    // for (var i = 0; i < referrals.length; i++) {  
    //   const myReferee = await stakingPools.connect(referrals[i]).getPoolreferee(0, referrals[i].address)
    //   var totalRefereeStakeAmount = 0

    //   for (var j = 0; j < myReferee.length; j++) {
    //     const stake = await stakingPools.connect(referrals[i]).getStakeTotalDeposited(myReferee[j], 0)
    //     const refereeStake = toTokenUnitsBN(stake, 18)
    //     totalRefereeStakeAmount = totalRefereeStakeAmount + refereeStake
    //   }
    //   console.log("====== referral power: =======", totalRefereeStakeAmount.toString());
    // }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
