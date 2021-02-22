pragma solidity ^0.6.2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import '../external/UniswapV2Library.sol';
import "./Constants.sol";
import "./PoolSetters.sol";
import "./IPool.sol";
import "hardhat/console.sol";
import "../oracle/IWETH.sol";

contract Pool is PoolSetters, IPool {
    using SafeMath for uint256;

    constructor(address dollar, address univ2) public {
        _state.provider.dollar = IERC20(dollar); //COOK
        _state.provider.univ2 = IERC20(univ2); //univ2 pair COOK/WETH
    }

    event Stake(address indexed account, uint256 univ2Amount);
    event Unstake(address indexed account, uint256 univ2Amount);
    event Claim(address indexed account, uint256 cookAmount);
    event Harvest(address indexed account, uint256 cookAmount);
    event Zap(address indexed account, uint256 cookAmount, uint256 lessWeth, uint256 newUniv2);

    fallback() external payable {
      revert();
    }

    function stake(uint256 univ2Amount) override external {

        updateStakeStates(univ2Amount, msg.sender);
        univ2().transferFrom(msg.sender, address(this), univ2Amount);
        uniBalanceCheck();

        emit Stake(msg.sender, univ2Amount);
    }

    function updateStakeStates(uint256 univ2Amount, address userAddress) internal {
        require(
            univ2Amount > 0,
            "zero stake amount"
        );

        calculateNewRewardSinceLastRewardBlock();

        uint256 totalRewardedWithPhantom = totalRewarded().add(totalPhantom());
        uint256 newPhantom = totalStaked() == 0 ?
            totalRewarded() == 0 ? Constants.getInitialStakeMultiple().mul(univ2Amount) : 0 :
            totalRewardedWithPhantom.mul(univ2Amount).div(totalStaked());

        incrementBalanceOfStaked(userAddress, univ2Amount);
        incrementBalanceOfPhantom(userAddress, newPhantom);
    }

    function zapStake(uint256 univ2Amount, address userAddress) override external {

        updateStakeStates(univ2Amount, userAddress);
        univ2().transferFrom(msg.sender, address(this), univ2Amount);
        uniBalanceCheck();

        emit Stake(userAddress, univ2Amount);
    }

    function calculateNewRewardSinceLastRewardBlock() virtual internal {
        uint256 lastRewardBlock = lastRewardBlock();
        uint256 blockNumber = blockNumber();
        if (blockNumber > lastRewardBlock) {
            if (totalStaked() != 0) {
                uint256 currentBlock = blockNumber;
                uint256 numOfBlocks = currentBlock.sub(lastRewardBlock);
                uint256 rewardAmount = numOfBlocks.mul(getRewardPerBlock());
                incrementTotalRewarded(rewardAmount);
            }
            updateLastRewardBlock(blockNumber);
        }
        dollarBalanceCheck();
    }

    function unstake(uint256 univ2Amount) external override {
        require(
            univ2Amount > 0,
            "zero unstake amount"
        );

        uint256 stakedBalance = balanceOfStaked(msg.sender);
        uint256 unstakableBalance = balanceOfUnstakable(msg.sender);
        require(
            unstakableBalance >= univ2Amount,
            "insufficient unstakable balance"
        );

        calculateNewRewardSinceLastRewardBlock();

        uint256 newClaimable = balanceOfRewarded(msg.sender).mul(univ2Amount).div(stakedBalance);
        uint256 lessPhantom = balanceOfPhantom(msg.sender).mul(univ2Amount).div(stakedBalance);

        addToVestingSchdule(msg.sender, newClaimable);
        decrementTotalRewarded(newClaimable, "insufficient rewarded balance");
        decrementBalanceOfStaked(msg.sender, univ2Amount, "insufficient staked balance");
        decrementBalanceOfPhantom(msg.sender, lessPhantom, "insufficient phantom balance");

        univ2().transfer(msg.sender, univ2Amount);
        uniBalanceCheck();

        emit Unstake(msg.sender, univ2Amount);
    }

    function harvest(uint256 cookAmount) external override {
        require(
            cookAmount > 0,
            "zero harvest amount"
        );

        require(
            totalRewarded() > 0,
            "insufficient total rewarded"
        );

        require(
            balanceOfRewarded(msg.sender) >= cookAmount,
            "insufficient rewarded balance"
        );

        addToVestingSchdule(msg.sender, cookAmount);
        decrementTotalRewarded(cookAmount, "insufficient rewarded balance");
        incrementBalanceOfPhantom(msg.sender, cookAmount);

        dollarBalanceCheck();

        emit Harvest(msg.sender, cookAmount);
    }

    function claim(uint256 cookAmount) external override {
        require(
            cookAmount > 0,
            "zero claim amount"
        );

        require(
            balanceOfClaimable(msg.sender) >= cookAmount,
            "insufficient claimable balance"
        );

        dollar().transfer(msg.sender, cookAmount);
        incrementBalanceOfClaimed(msg.sender, cookAmount);

        emit Claim(msg.sender, cookAmount);
    }

    function _calWethAmountToPairCook(uint256 cookAmount) internal returns (uint256, address) {
        IUniswapV2Pair lpPair = IUniswapV2Pair(address(univ2()));

        uint reserve0;
        uint reserve1;
        address weth;
        if (lpPair.token0() == address(dollar())) {
            (reserve0, reserve1,) = lpPair.getReserves();
            weth = lpPair.token1();
        } else {
            (reserve1, reserve0,) = lpPair.getReserves();
            weth = lpPair.token0();
        }

        uint256 wethAmount = (reserve0 == 0 && reserve1 == 0) ?
                cookAmount :
                UniswapV2Library.quote(cookAmount, reserve0, reserve1);

        return (wethAmount, weth);
    }

    function addLiquidity(uint256 cookAmount) internal returns (uint256, uint256) {
        (uint256 wethAmount, address wethAddress) = _calWethAmountToPairCook(cookAmount);
        IUniswapV2Pair lpPair = IUniswapV2Pair(address(univ2()));

        dollar().transfer(address(univ2()), cookAmount);
        IERC20(wethAddress).transferFrom(msg.sender, address(univ2()), wethAmount);
        return (wethAmount, lpPair.mint(address(this)));
    }

    function addLiquidityWithEth(uint256 cookAmount) internal returns(uint256, uint256) {
        (uint256 wethAmount, address wethAddress) = _calWethAmountToPairCook(cookAmount);

        require (
          msg.value == wethAmount,
          "Please provide exact amount of eth needed to pair cook tokens"
        );
        IUniswapV2Pair lpPair = IUniswapV2Pair(address(univ2()));

        // Swap ETH to WETH for user
        IWETH(wethAddress).deposit{ value: msg.value }();
        dollar().transfer(address(univ2()), cookAmount);

        IERC20(wethAddress).transferFrom(address(this), address(univ2()), wethAmount);

        return (wethAmount, lpPair.mint(address(this)));
    }

    function _zap(uint256 cookAmount, bool isWithEth) internal {
      require(
          cookAmount > 0,
          "zero zap amount"
      );

      require(
          balanceOfClaimable(msg.sender) >= cookAmount,
          "insufficient claimable balancex"
      );

      uint256 lessWeth = 0;
      uint256 newUniv2 = 0;

      if (isWithEth) {
          (lessWeth, newUniv2) = addLiquidityWithEth(cookAmount);
      } else {
          (lessWeth, newUniv2) = addLiquidity(cookAmount);
      }

      incrementBalanceOfClaimed(msg.sender, cookAmount);
      updateStakeStates(newUniv2, msg.sender);
      uniBalanceCheck();

      emit Zap(msg.sender, cookAmount, lessWeth, newUniv2);
    }

    function zap(uint256 cookAmount) external {
      _zap(cookAmount, false);
    }

    function zapWithEth(uint256 cookAmount) external payable {
      _zap(cookAmount, true);
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
