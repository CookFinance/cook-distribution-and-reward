pragma solidity ^0.6.2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./PoolState.sol";
import "./Constants.sol";
import "hardhat/console.sol";

contract PoolGetters is PoolState {
    using SafeMath for uint256;

    uint32 private constant SECONDS_PER_DAY = 86400; /* 86400 seconds in a day */

    /**
     * Global
     */
    function cook() public view virtual returns (IERC20) {
        return _state.provider.cook;
    }

    function univ2() public view virtual returns (IERC20) {
        return _state.provider.univ2;
    }

    function totalStaked() public view returns (uint256) {
        return _state.balance.staked;
    }

    function totalRewarded() public view returns (uint256) {
        return _state.balance.rewarded;
    }

    function totalClaimed() public view returns (uint256) {
        return _state.balance.claimed;
    }

    function totalVesting() public view returns (uint256) {
        return _state.balance.vesting;
    }

    function totalPhantom() public view returns (uint256) {
        return _state.balance.phantom;
    }

    function lastRewardBlock() public view returns (uint256) {
        return _state.lastRewardBlock;
    }

    function getRewardPerBlock() public view virtual returns (uint256) {
        return _state.REWARD_PER_BLOCK;
    }

    // Overridable for testing
    function getStakeLockupDuration() public view virtual returns (uint256) {
        return Constants.getStakeLockupDuration();
    }

    function getVestingDuration() public view virtual returns (uint256) {
        return Constants.getVestingDuration();
    }

    function blockNumber() internal view virtual returns (uint256) {
        return block.number;
    }

    function blockTimestamp() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    /**
     * Account
     */
    function balanceOfStaked(address account) public view returns (uint256) {
        return _state.accounts[account].staked;
    }

    function stakingScheduleStartTime(address account)
        public
        view
        returns (uint256[] memory)
    {
        uint256 stakingsLength = _state.accounts[account].stakings.length;
        uint256[] memory array = new uint256[](stakingsLength);
        for (uint256 i = 0; i < stakingsLength; i++) {
            array[i] = _state.accounts[account].stakings[i].start;
        }
        return array;
    }

    function stakingScheduleAmount(address account)
        public
        view
        returns (uint256[] memory)
    {
        uint256 stakingsLength = _state.accounts[account].stakings.length;
        uint256[] memory array = new uint256[](stakingsLength);
        for (uint256 i = 0; i < stakingsLength; i++) {
            array[i] = _state.accounts[account].stakings[i].amount;
        }
        return array;
    }

    function balanceOfUnstakable(address account)
        public
        view
        returns (uint256)
    {
        uint256 unstakable;

        for (uint256 i = 0; i < _state.accounts[account].stakings.length; i++) {
            uint256 totalStakingAmount =
                _state.accounts[account].stakings[i].amount;
            uint256 start = _state.accounts[account].stakings[i].start;

            uint32 startDay = uint32(start / SECONDS_PER_DAY);
            uint32 today = uint32(blockTimestamp() / SECONDS_PER_DAY);

            // IF an address is blacklisted, the account can't claim/harvest/zap cook rewrad, hence the address can unstake completely
            if (
                (today >= (startDay + getStakeLockupDuration())) ||
                isAddrBlacklisted(account)
            ) {
                unstakable += totalStakingAmount; // If after end of staking lockup, then the unstakable amount is total amount.
            } else {
                unstakable += 0; // If it's before the staking lockup then the unstakable amount is zero.
            }
        }
        return unstakable;
    }

    function balanceOfPhantom(address account) public view returns (uint256) {
        return _state.accounts[account].phantom;
    }

    function balanceOfRewarded(address account) public view returns (uint256) {
        uint256 totalStakedAmount = totalStaked();
        if (totalStakedAmount == 0) {
            return 0;
        }
        uint256 totalRewardedWithPhantom = totalRewarded().add(totalPhantom());
        uint256 balanceOfRewardedWithPhantom =
            totalRewardedWithPhantom.mul(balanceOfStaked(account)).div(
                totalStakedAmount
            );

        uint256 phantomBalance = balanceOfPhantom(account);
        if (balanceOfRewardedWithPhantom > phantomBalance) {
            return balanceOfRewardedWithPhantom.sub(phantomBalance);
        }
        return 0;
    }

    function balanceOfClaimed(address account) public view returns (uint256) {
        return _state.accounts[account].claimed;
    }

    function balanceOfVesting(address account) public view returns (uint256) {
        uint256 totalVestingAmount;
        for (uint256 i = 0; i < _state.accounts[account].vestings.length; i++) {
            totalVestingAmount += _state.accounts[account].vestings[i].amount;
        }
        return totalVestingAmount;
    }

    function balanceOfClaimable(address account) public view returns (uint256) {
        uint256 claimable;

        for (uint256 i = 0; i < _state.accounts[account].vestings.length; i++) {
            uint256 totalVestingAmount =
                _state.accounts[account].vestings[i].amount;
            uint256 start = _state.accounts[account].vestings[i].start;

            uint32 startDay = uint32(start / SECONDS_PER_DAY);
            uint32 today = uint32(blockTimestamp() / SECONDS_PER_DAY);
            uint32 vestingInterval = Constants.getVestingInterval();
            uint256 vestingDuration = getVestingDuration();

            if (today >= (startDay + vestingDuration)) {
                claimable += totalVestingAmount; // If after end of vesting, then the vested amount is total amount.
            } else if (today <= startDay) {
                claimable += 0; // If it's before the vesting then the vested amount is zero.
            } else {
                // Otherwise a fractional amount is vested.
                // Compute the exact number of days vested.
                uint32 daysVested = today - startDay;
                // Adjust result rounding down to take into consideration the interval.
                uint32 effectiveDaysVested =
                    (daysVested / vestingInterval) * vestingInterval;
                uint256 vested =
                    totalVestingAmount.mul(effectiveDaysVested).div(
                        vestingDuration
                    );
                claimable += vested;
            }
        }
        return claimable - balanceOfClaimed(account);
    }

    function isMiningPaused() internal view returns (bool) {
        return _state.pauseMinig;
    }

    function isFull() public view returns (bool) {
        return _state.totalPoolCapLimit != 0 && _state.balance.staked >= _state.totalPoolCapLimit;
    }

    function isAddrBlacklisted(address addr) internal view returns (bool) {
        return _state.accounts[addr].isBlacklisted;
    }

    function totalPoolCapLimit() public view returns (uint256) {
        return _state.totalPoolCapLimit;
    }

    function stakeLimitPerAddress() public view returns (uint256) {
        return _state.stakeLimitPerAddress;
    }

    function checkMiningPaused() public {
        require(
            isMiningPaused() == false,
            "liquidity mining program is paused due to some emergency, please stay tuned"
        );
    }

    function ensureAddrNotBlacklisted(address addr) public {
        require(
            isAddrBlacklisted(addr) == false,
            "Your address is blacklisted, you can not claim/harvet/zap cook reward, but you can withdraw you LP tokens"
        );
    }

    function checkPoolStakeCapLimit(uint256 amountToStake) public {
        require(
            (_state.totalPoolCapLimit == 0 || // no limit
                (_state.balance.staked + amountToStake) <=
                _state.totalPoolCapLimit) == true,
            "The amount to be staked will exceed pool limit"
        );
    }

    function checkPerAddrStakeLimit(uint256 amountToStake, address account)
        public
    {
        require(
            (_state.stakeLimitPerAddress == 0 || // no limit
                (balanceOfStaked(account) + amountToStake) <=
                _state.stakeLimitPerAddress) == true,
            "The amount to be staked will exceed per address stake limit"
        );
    }
}
