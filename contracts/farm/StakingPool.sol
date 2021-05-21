/*
    Copyright 2021 Cook Finance.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

    SPDX-License-Identifier: Apache License, Version 2.0
*/
pragma solidity ^0.6.2;
pragma experimental ABIEncoderV2;

//import "hardhat/console.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import {FixedPointMath} from "../lib/FixedPointMath.sol";
import {IMintableERC20} from "../interfaces/IMintableERC20.sol";
import {IRewardVesting} from "../interfaces/IRewardVesting.sol";
import {Pool} from "./Pool.sol";
import {Stake} from "./Stake.sol";
import {ReferralPower} from "./ReferralPower.sol";

/// @dev A contract which allows users to stake to farm tokens.
///
/// This contract was inspired by Chef Nomi's 'MasterChef' contract which can be found in this
/// repository: https://github.com/sushiswap/sushiswap.
contract StakingPools is ReentrancyGuard {
  using FixedPointMath for FixedPointMath.uq192x64;
  using Pool for Pool.Data;
  using Pool for Pool.List;
  using SafeERC20 for IERC20;
  using SafeMath for uint256;
  using Stake for Stake.Data;
  using ReferralPower for ReferralPower.Data;

  event PendingGovernanceUpdated(
    address pendingGovernance
  );

  event GovernanceUpdated(
    address governance
  );

  event RewardRateUpdated(
    uint256 rewardRate
  );

  event PoolRewardWeightUpdated(
    uint256 indexed poolId,
    uint256 rewardWeight
  );

  event PoolCreated(
    uint256 indexed poolId,
    IERC20 indexed token
  );

  event TokensDeposited(
    address indexed user,
    uint256 indexed poolId,
    uint256 amount
  );

  event TokensWithdrawn(
    address indexed user,
    uint256 indexed poolId,
    uint256 amount
  );

  event TokensClaimed(
    address indexed user,
    uint256 indexed poolId,
    uint256 amount
  );

  event PauseUpdated(
    bool status
  );

  event SentinelUpdated(
    address sentinel
  );

  event RewardVestingUpdated(
    IRewardVesting rewardVesting
  );

  /// @dev The token which will be minted as a reward for staking.
  IERC20 public reward;

  /// @dev The address of reward vesting.
  IRewardVesting public rewardVesting;

  /// @dev The address of the account which currently has administrative capabilities over this contract.
  address public governance;

  address public pendingGovernance;

  /// @dev The address of the account which can perform emergency activities
  address public sentinel;

  /// @dev Tokens are mapped to their pool identifier plus one. Tokens that do not have an associated pool
  /// will return an identifier of zero.
  mapping(IERC20 => uint256) public tokenPoolIds;

  /// @dev The context shared between the pools.
  Pool.Context private _ctx;

  /// @dev A list of all of the pools.
  Pool.List private _pools;

  /// @dev A mapping of all of the user stakes mapped first by pool and then by address.
  mapping(address => mapping(uint256 => Stake.Data)) private _stakes;

  /// @dev A mapping of all of the user referral power mapped first by pool and then by address.
  mapping(address => mapping(uint256 => ReferralPower.Data)) private _referralPowers;

/// @dev A mapping of all of the referree staker power mapped first by pool and then by referral address.
  mapping(address => mapping(uint256 => address)) public myReferral;

  /// @dev A mapping of referralIsKnown mapped first by pool and then by address.
  mapping(address => mapping(uint256 => bool)) public referralIsKnown;

  /// @dev A mapping of userAddress mapped first by pool and then by nextReferral.
  mapping(uint256 => mapping(uint256 => address)) public referralList;

  /// @dev index record next user index mapped by pool
  mapping(uint256 => uint256) public nextReferral;

  /// @dev A flag indicating if claim should be halted
  bool public pause;

  constructor(
    IMintableERC20 _reward,
    address _governance,
    address _sentinel,
    IRewardVesting _rewardVesting
  ) public {
    require(_governance != address(0), "StakingPools: governance address cannot be 0x0");
    require(_sentinel != address(0), "StakingPools: sentinel address cannot be 0x0");

    reward = _reward;
    governance = _governance;
    sentinel = _sentinel;
    rewardVesting = _rewardVesting;
  }

  /// @dev A modifier which reverts when the caller is not the governance.
  modifier onlyGovernance() {
    require(msg.sender == governance, "StakingPools: only governance");
    _;
  }

  ///@dev modifier add referral to referrallist. Users are indexed in order to keep track of
  modifier checkIfNewReferral(uint256 pid, address referral) {
      if (!referralIsKnown[referral][pid]) {
          referralList[nextReferral[pid]][pid] = referral;
          referralIsKnown[referral][pid] = true;
          nextReferral[pid]++;
      }
      _;
  }

  /// @dev Sets the governance.
  ///
  /// This function can only called by the current governance.
  ///
  /// @param _pendingGovernance the new pending governance.
  function setPendingGovernance(address _pendingGovernance) external onlyGovernance {
    require(_pendingGovernance != address(0), "StakingPools: pending governance address cannot be 0x0");
    pendingGovernance = _pendingGovernance;

    emit PendingGovernanceUpdated(_pendingGovernance);
  }

  function acceptGovernance() external {
    require(msg.sender == pendingGovernance, "StakingPools: only pending governance");

    address _pendingGovernance = pendingGovernance;
    governance = _pendingGovernance;

    emit GovernanceUpdated(_pendingGovernance);
  }

  /// @dev Sets the distribution reward rate.
  ///
  /// This will update all of the pools.
  ///
  /// @param _rewardRate The number of tokens to distribute per second.
  function setRewardRate(uint256 _rewardRate) external onlyGovernance {
    _updatePools();

    _ctx.rewardRate = _rewardRate;

    emit RewardRateUpdated(_rewardRate);
  }

  /// @dev Creates a new pool.
  function createPool(IERC20 _token, bool _needVesting, uint256 durationInSecs) external onlyGovernance returns (uint256) {
    require(tokenPoolIds[_token] == 0, "StakingPools: token already has a pool");

    uint256 _poolId = _pools.length();

    _pools.push(Pool.Data({
      token: _token,
      totalDeposited: 0,
      rewardWeight: 0,
      accumulatedRewardWeight: FixedPointMath.uq192x64(0),
      lastUpdatedBlock: block.number,
      needVesting: _needVesting,
      vestingDurationInSecs: durationInSecs,
      onReferralBonus: false,
      totalReferralAmount: 0,
      accumulatedReferralWeight: FixedPointMath.uq192x64(0)
    }));

    tokenPoolIds[_token] = _poolId + 1;

    emit PoolCreated(_poolId, _token);

    return _poolId;
  }

  /// @dev Sets the reward weights of all of the pools.
  ///
  /// @param _rewardWeights The reward weights of all of the pools.
  function setRewardWeights(uint256[] calldata _rewardWeights) external onlyGovernance {
    require(_rewardWeights.length == _pools.length(), "StakingPools: weights length mismatch");

    _updatePools();

    uint256 _totalRewardWeight = _ctx.totalRewardWeight;
    for (uint256 _poolId = 0; _poolId < _pools.length(); _poolId++) {
      Pool.Data storage _pool = _pools.get(_poolId);

      uint256 _currentRewardWeight = _pool.rewardWeight;
      if (_currentRewardWeight == _rewardWeights[_poolId]) {
        continue;
      }

      // FIXME
      _totalRewardWeight = _totalRewardWeight.sub(_currentRewardWeight).add(_rewardWeights[_poolId]);
      _pool.rewardWeight = _rewardWeights[_poolId];

      emit PoolRewardWeightUpdated(_poolId, _rewardWeights[_poolId]);
    }

    _ctx.totalRewardWeight = _totalRewardWeight;
  }

  /// @dev Stakes tokens into a pool.
  ///
  /// @param _poolId        the pool to deposit tokens into.
  /// @param _depositAmount the amount of tokens to deposit.
  function deposit(uint256 _poolId, uint256 _depositAmount, address referral) external nonReentrant checkIfNewReferral(_poolId, referral) {
    Pool.Data storage _pool = _pools.get(_poolId);
    _pool.update(_ctx);

    Stake.Data storage _stake = _stakes[msg.sender][_poolId];
    _stake.update(_pool, _ctx);

    address _referral = address(0); // only for var initialization
    if (_pool.onReferralBonus) {
      if (referral != address(0)) {
        require (myReferral[msg.sender][_poolId] == address(0));
        myReferral[msg.sender][_poolId] = referral;
      }

      _referral = myReferral[msg.sender][_poolId];
      if (_referral != address(0)) {
        ReferralPower.Data storage _referralPower = _referralPowers[_referral][_poolId];
        _referralPower.update(_pool, _ctx);
      }
    }

    _deposit(_poolId, _depositAmount, _referral);
  }

  /// @dev Withdraws staked tokens from a pool.
  ///
  /// @param _poolId          The pool to withdraw staked tokens from.
  /// @param _withdrawAmount  The number of tokens to withdraw.
  function withdraw(uint256 _poolId, uint256 _withdrawAmount) external nonReentrant {
    Pool.Data storage _pool = _pools.get(_poolId);
    _pool.update(_ctx);

    Stake.Data storage _stake = _stakes[msg.sender][_poolId];
    _stake.update(_pool, _ctx);

    address _referral = _pool.onReferralBonus ? myReferral[msg.sender][_poolId] : address(0);

    if (_pool.onReferralBonus && _referral != address(0)) {
      ReferralPower.Data storage _referralPower = _referralPowers[_referral][_poolId];
      _referralPower.update(_pool, _ctx);
    }

    _claim(_poolId);
    _withdraw(_poolId, _withdrawAmount, _referral);
  }

  /// @dev Claims all rewarded tokens from a pool.
  ///
  /// @param _poolId The pool to claim rewards from.
  ///
  /// @notice use this function to claim the tokens from a corresponding pool by ID.
  function claim(uint256 _poolId) external nonReentrant {
    Pool.Data storage _pool = _pools.get(_poolId);
    _pool.update(_ctx);

    Stake.Data storage _stake = _stakes[msg.sender][_poolId];

    _stake.update(_pool, _ctx);

    _claim(_poolId);
  }

  /// @dev Claims all rewards from a pool and then withdraws all staked tokens.
  ///
  /// @param _poolId the pool to exit from.
  function exit(uint256 _poolId) external nonReentrant {
    Pool.Data storage _pool = _pools.get(_poolId);
    _pool.update(_ctx);

    Stake.Data storage _stake = _stakes[msg.sender][_poolId];
    _stake.update(_pool, _ctx);

    address _referral = _pool.onReferralBonus ? myReferral[msg.sender][_poolId] : address(0);

    if (_pool.onReferralBonus && _referral != address(0)) {
      ReferralPower.Data storage _referralPower = _referralPowers[_referral][_poolId];
      _referralPower.update(_pool, _ctx);
    }

    _claim(_poolId);
    _withdraw(_poolId, _stake.totalDeposited, _referral);
  }

  /// @dev Gets the rate at which tokens are minted to stakers for all pools.
  ///
  /// @return the reward rate.
  function rewardRate() external view returns (uint256) {
    return _ctx.rewardRate;
  }

  /// @dev Gets the total reward weight between all the pools.
  ///
  /// @return the total reward weight.
  function totalRewardWeight() external view returns (uint256) {
    return _ctx.totalRewardWeight;
  }

  /// @dev Gets the number of pools that exist.
  ///
  /// @return the pool count.
  function poolCount() external view returns (uint256) {
    return _pools.length();
  }

  /// @dev Gets the token a pool accepts.
  ///
  /// @param _poolId the identifier of the pool.
  ///
  /// @return the token.
  function getPoolToken(uint256 _poolId) external view returns (IERC20) {
    Pool.Data storage _pool = _pools.get(_poolId);
    return _pool.token;
  }

  /// @dev Gets the total amount of funds staked in a pool.
  ///
  /// @param _poolId the identifier of the pool.
  ///
  /// @return the total amount of staked or deposited tokens.
  function getPoolTotalDeposited(uint256 _poolId) external view returns (uint256) {
    Pool.Data storage _pool = _pools.get(_poolId);
    return _pool.totalDeposited;
  }

  /// @dev Gets the total amount of referreal power in a pool.
  ///
  /// @param _poolId the identifier of the pool.
  ///
  /// @return the total amount of referreal power in pool.
  function getPoolTotalReferralAmount(uint256 _poolId) external view returns (uint256) {
    Pool.Data storage _pool = _pools.get(_poolId);
    return _pool.totalReferralAmount;
  }

  /// @dev Gets the reward weight of a pool which determines how much of the total rewards it receives per block.
  ///
  /// @param _poolId the identifier of the pool.
  ///
  /// @return the pool reward weight.
  function getPoolRewardWeight(uint256 _poolId) external view returns (uint256) {
    Pool.Data storage _pool = _pools.get(_poolId);
    return _pool.rewardWeight;
  }

  /// @dev Gets the amount of tokens per block being distributed to stakers for a pool.
  ///
  /// @param _poolId the identifier of the pool.
  ///
  /// @return the pool reward rate.
  function getPoolRewardRate(uint256 _poolId) external view returns (uint256) {
    Pool.Data storage _pool = _pools.get(_poolId);
    return _pool.getRewardRate(_ctx);
  }

  /// @dev Gets the number of tokens a user has staked into a pool.
  ///
  /// @param _account The account to query.
  /// @param _poolId  the identifier of the pool.
  ///
  /// @return the amount of deposited tokens.
  function getStakeTotalDeposited(address _account, uint256 _poolId) external view returns (uint256) {
    Stake.Data storage _stake = _stakes[_account][_poolId];
    return _stake.totalDeposited;
  }

  /// @dev Gets the number of unclaimed reward tokens a user can claim from a pool.
  ///
  /// @param _account The account to get the unclaimed balance of.
  /// @param _poolId  The pool to check for unclaimed rewards.
  ///
  /// @return the amount of unclaimed reward tokens a user has in a pool.
  function getStakeTotalUnclaimed(address _account, uint256 _poolId) external view returns (uint256) {
    Stake.Data storage _stake = _stakes[_account][_poolId];
    return _stake.getUpdatedTotalUnclaimed(_pools.get(_poolId), _ctx);
  }

  /// @dev Gets address accumulated power.
  ///
  /// @param _referral The referral account to get accumulated power.
  /// @param _poolId  The pool to check for accumulated power.
  ///
  /// @return the amount of accumulated power a user has in a pool.
  function getAccumulatedReferralPower(address _referral, uint256 _poolId) external view returns (uint256) {
    ReferralPower.Data storage _referralPower = _referralPowers[_referral][_poolId];
    return _referralPower.getUpdatedTotalReferralPower(_pools.get(_poolId), _ctx);
  }


  function getPoolUser(uint256 _poolId, uint256 _userIndex) external view returns (address) {
    return referralList[_userIndex][_poolId];
  }

  /// @dev Updates all of the pools.
  function _updatePools() internal {
    for (uint256 _poolId = 0; _poolId < _pools.length(); _poolId++) {
      Pool.Data storage _pool = _pools.get(_poolId);
      _pool.update(_ctx);
    }
  }

  /// @dev Stakes tokens into a pool.
  ///
  /// The pool and stake MUST be updated before calling this function.
  ///
  /// @param _poolId        the pool to deposit tokens into.
  /// @param _depositAmount the amount of tokens to deposit.
  function _deposit(uint256 _poolId, uint256 _depositAmount, address _referral) internal {
    Pool.Data storage _pool = _pools.get(_poolId);
    Stake.Data storage _stake = _stakes[msg.sender][_poolId];

    _pool.totalDeposited = _pool.totalDeposited.add(_depositAmount);
    _stake.totalDeposited = _stake.totalDeposited.add(_depositAmount);

    if (_pool.onReferralBonus && _referral != address(0)) {
      ReferralPower.Data storage _referralPower = _referralPowers[_referral][_poolId];
      _pool.totalReferralAmount = _pool.totalReferralAmount.add(_depositAmount);
      _referralPower.totalDeposited = _referralPower.totalDeposited.add(_depositAmount);
    }

    _pool.token.safeTransferFrom(msg.sender, address(this), _depositAmount);

    emit TokensDeposited(msg.sender, _poolId, _depositAmount);
  }

  /// @dev Withdraws staked tokens from a pool.
  ///
  /// The pool and stake MUST be updated before calling this function.
  ///
  /// @param _poolId          The pool to withdraw staked tokens from.
  /// @param _withdrawAmount  The number of tokens to withdraw.
  function _withdraw(uint256 _poolId, uint256 _withdrawAmount, address _referral) internal {
    Pool.Data storage _pool = _pools.get(_poolId);
    Stake.Data storage _stake = _stakes[msg.sender][_poolId];

    _pool.totalDeposited = _pool.totalDeposited.sub(_withdrawAmount);
    _stake.totalDeposited = _stake.totalDeposited.sub(_withdrawAmount);

    if (_pool.onReferralBonus && _referral != address(0)) {
      ReferralPower.Data storage _referralPower = _referralPowers[_referral][_poolId];
      _pool.totalReferralAmount = _pool.totalReferralAmount.sub(_withdrawAmount);
      _referralPower.totalDeposited = _referralPower.totalDeposited.sub(_withdrawAmount);
    }

    _pool.token.safeTransfer(msg.sender, _withdrawAmount);

    emit TokensWithdrawn(msg.sender, _poolId, _withdrawAmount);
  }

  /// @dev Claims all rewarded tokens from a pool.
  ///
  /// The pool and stake MUST be updated before calling this function.
  ///
  /// @param _poolId The pool to claim rewards from.
  ///
  /// @notice use this function to claim the tokens from a corresponding pool by ID.
  function _claim(uint256 _poolId) internal {
    require(!pause, "StakingPools: emergency pause enabled");

    Pool.Data storage _pool = _pools.get(_poolId);
    Stake.Data storage _stake = _stakes[msg.sender][_poolId];

    uint256 _claimAmount = _stake.totalUnclaimed;
    _stake.totalUnclaimed = 0;

    if(_pool.needVesting){
      reward.approve(address(rewardVesting),uint(-1));
      rewardVesting.addEarning(msg.sender, _claimAmount, _pool.vestingDurationInSecs);
    } else {
      reward.safeTransfer(msg.sender, _claimAmount);
    }

    emit TokensClaimed(msg.sender, _poolId, _claimAmount);
  }

  /// @dev Updates the reward vesting contract
  ///
  /// @param _rewardVesting the new reward vesting contract
  function setRewardVesting(IRewardVesting _rewardVesting) external {
    require(pause && (msg.sender == governance || msg.sender == sentinel), "StakingPools: not paused, or not governance or sentinel");
    rewardVesting = _rewardVesting;
    emit RewardVestingUpdated(_rewardVesting);
  }

  /// @dev Sets the address of the sentinel
  ///
  /// @param _sentinel address of the new sentinel
  function setSentinel(address _sentinel) external onlyGovernance {
      require(_sentinel != address(0), "StakingPools: sentinel address cannot be 0x0.");
      sentinel = _sentinel;
      emit SentinelUpdated(_sentinel);
  }

  /// @dev Sets if the contract should enter emergency pause mode.
  ///
  /// There are 2 main reasons to pause:
  ///     1. Need to shut down claims in case of any issues in the reward vesting contract
  ///     2. Need to migrate to a new reward vesting contract
  ///
  /// While this contract is paused, claim is disabled
  ///
  /// @param _pause if the contract should enter emergency pause mode.
  function setPause(bool _pause) external {
      require(msg.sender == governance || msg.sender == sentinel, "StakingPools: !(gov || sentinel)");
      pause = _pause;
      emit PauseUpdated(_pause);
  }

  function startReferralBonus(uint256 _poolId) external {
      require(msg.sender == governance || msg.sender == sentinel, "startReferralBonus: !(gov || sentinel)");
      Pool.Data storage _pool = _pools.get(_poolId);
      require(_pool.onReferralBonus == false, "referral bonus already on");
      _pool.onReferralBonus = true;
  }

  function stoptReferralBonus(uint256 _poolId) external {
      require(msg.sender == governance || msg.sender == sentinel, "stoptReferralBonus: !(gov || sentinel)");
      Pool.Data storage _pool = _pools.get(_poolId);
      require(_pool.onReferralBonus == true, "referral not turned on");
      _pool.onReferralBonus = false;
  }
}

