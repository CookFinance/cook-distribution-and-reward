pragma solidity ^0.6.2;

library Constants {
  /* Pool */
  uint256 private constant REWARD_PER_BLOCK = 2e18; // 2 cook token per block
  uint256 private constant INITIAL_STAKE_MULTIPLE = 1e6;
  uint256 private constant VESTING_DURATION = 180; //180 days (6 months)
  uint32 private constant VESTING_INTERVAL = 30; //30 days (1 month)
  uint256 private constant STAKE_LOCKUP_DURATION = 30; //30 days (1 month)

  /**
   * Getters
   */
  function getRewardPerBlock() internal pure returns (uint256) {
      return REWARD_PER_BLOCK;
  }

  function getInitialStakeMultiple() internal pure returns (uint256) {
      return INITIAL_STAKE_MULTIPLE;
  }

  function getVestingDuration() internal pure returns (uint256) {
    return VESTING_DURATION;
  }

  function getVestingInterval() internal pure returns (uint32) {
    return VESTING_INTERVAL;
  }

  function getStakeLockupDuration() internal pure returns (uint256) {
    return STAKE_LOCKUP_DURATION;
  }
}
