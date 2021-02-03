pragma solidity ^0.6.2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Constants.sol";
import "./PoolSetters.sol";
import "hardhat/console.sol";
import "../mock/MockCOOK.sol";

contract Pool is PoolSetters {
    using SafeMath for uint256;

    constructor(address dollar, address univ2) public {
        _state.provider.dollar = MockCOOK(dollar); //COOK
        _state.provider.univ2 = IERC20(univ2); //univ2 pair COOK/WETH
    }

    event Stake(address indexed account, uint256 univ2Amount);
    event Unstake(address indexed account, uint256 univ2Amount);
    event Claim(address indexed account, uint256 cookAmount);
    event Harvest(address indexed account, uint256 cookAmount);

    function stake(uint256 value) external {
        require(
            value > 0,
            "zero stake amount"
        );

        calculateNewRewardSinceLastRewardBlock();

        uint256 totalRewardedWithPhantom = totalRewarded().add(totalPhantom());
        uint256 newPhantom = totalStaked() == 0 ?
            totalRewarded() == 0 ? Constants.getInitialStakeMultiple().mul(value) : 0 :
            totalRewardedWithPhantom.mul(value).div(totalStaked());

        incrementBalanceOfStaked(msg.sender, value);
        incrementBalanceOfPhantom(msg.sender, newPhantom);

        univ2().transferFrom(msg.sender, address(this), value);
        uniBalanceCheck();

        emit Stake(msg.sender, value);
    }

    function calculateNewRewardSinceLastRewardBlock() virtual internal {
        uint256 lastRewardBlock = lastRewardBlock();
        uint256 blockNumber = blockNumber();
        if (blockNumber > lastRewardBlock) {
            if (totalStaked() != 0) {
                uint256 currentBlock = blockNumber;
                uint256 numOfBlocks = currentBlock.sub(lastRewardBlock);
                uint256 rewardAmount = numOfBlocks.mul(getRewardPerBlock());
                dollar().mint(address(this), rewardAmount);
                incrementTotalRewarded(rewardAmount);
            }
            updateLastRewardBlock(blockNumber);
        }
        dollarBalanceCheck();
    }

    function unstake(uint256 value) external {
        require(
            value > 0,
            "zero unstake amount"
        );

        uint256 stakedBalance = balanceOfStaked(msg.sender);
        uint256 unstakableBalance = balanceOfUnstakable(msg.sender);
        require(
            unstakableBalance >= value,
            "insufficient unstakable balance"
        );

        calculateNewRewardSinceLastRewardBlock();

        uint256 newClaimable = balanceOfRewarded(msg.sender).mul(value).div(stakedBalance);
        uint256 lessPhantom = balanceOfPhantom(msg.sender).mul(value).div(stakedBalance);

        addToVestingSchdule(msg.sender, newClaimable);
        decrementTotalRewarded(newClaimable, "insufficient rewarded balance");
        decrementBalanceOfStaked(msg.sender, value, "insufficient staked balance");
        decrementBalanceOfPhantom(msg.sender, lessPhantom, "insufficient phantom balance");

        univ2().transfer(msg.sender, value);
        uniBalanceCheck();
        
        emit Unstake(msg.sender, value);
    }

    function harvest(uint256 value) external {
        require(
            value > 0,
            "zero harvest amount"
        );

        require(
            totalRewarded() > 0,
            "insufficient total rewarded"
        );
        
        require(
            balanceOfRewarded(msg.sender) >= value,
            "insufficient rewarded balance"
        );

        addToVestingSchdule(msg.sender, value);
        decrementTotalRewarded(value, "insufficient rewarded balance");
        incrementBalanceOfPhantom(msg.sender, value);

        dollarBalanceCheck();

        emit Harvest(msg.sender, value);
    }

    function claim(uint256 value) external {
        require(
            value > 0,
            "zero claim amount"
        );

        require(
            balanceOfClaimable(msg.sender) >= value,
            "insufficient claimable balance"
        );

        dollar().transfer(msg.sender, value);
        incrementBalanceOfClaimed(msg.sender, value);

        emit Claim(msg.sender, value);
    }

    function uniBalanceCheck() private view {
        require(
            univ2().balanceOf(address(this)) >= totalStaked(),
            "Inconsistent UNI-V2 balances"
        );
    }

    function dollarBalanceCheck() private view {
        require(
            dollar().balanceOf(address(this)) >= totalVesting() + totalRewarded() - totalClaimed(),
            "Inconsistent COOK balances"
        );
    }
}
