pragma solidity ^0.6.2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../oracle/IOracle.sol";
import "../oracle/IWETH.sol";
import "../oracle/IPriceConsumerV3.sol";
import "./IPool.sol";
import "hardhat/console.sol";
import "../external/UniswapV2Library.sol";

/**
 * @title TokenVesting
 * @dev A token holder contract that can release its token balance gradually like a
 * typical vesting scheme, with a cliff and vesting period.
 */
contract CookDistribution is Ownable, AccessControl {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event AllocationRegistered(address indexed beneficiary, uint256 amount);
    event TokensWithdrawal(address userAddress, uint256 amount);

    struct Allocation {
        uint256 amount;
        uint256 released;
        bool blackListed;
        bool isRegistered;
    }

    // beneficiary of tokens after they are released
    mapping(address => Allocation) private _beneficiaryAllocations;

    // oracle price data (dayNumber => price)
    mapping(uint256 => uint256) private _oraclePriceFeed;

    // all beneficiary address1
    address[] private _allBeneficiary;

    // vesting start time unix
    uint256 private _start;

    // vesting duration in day
    uint256 private _duration;

    // vesting interval
    uint32 private _interval;

    // released percentage triggered by price, should divided by 100
    uint256 private _advancePercentage;

    // last released percentage triggered date in dayNumber
    uint256 private _lastPriceUnlockDay;

    // next step to unlock
    uint32 private _nextPriceUnlockStep;

    // Max step can be moved
    uint32 private _maxPriceUnlockMoveStep;

    IERC20 private _token;

    IOracle private _oracle;
    IPriceConsumerV3 private _priceConsumer;

    // Date-related constants for sanity-checking dates to reject obvious erroneous inputs
    // SECONDS_PER_DAY = 30 for test only
    uint32 private constant SECONDS_PER_DAY = 86400; /* 86400 seconds in a day */

    uint256[] private _priceKey;
    uint256[] private _percentageValue;
    mapping(uint256 => uint256) private _pricePercentageMapping;

    // Fields for Admin
    // stop everyone from claiming/zapping cook token due to emgergency
    bool private _pauseClaim;

    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");

    constructor(
        IERC20 token_,
        address[] memory beneficiaries_,
        uint256[] memory amounts_,
        uint256 start, // in unix
        uint256 duration, // in day
        uint32 interval, // in day
        address oracle_,
        address priceConsumer_
    ) public {
        require(token_ != IERC20(0), "Cook token can not be none");
        require(oracle_ != address(0), "Oracle address can not be zero.");
        require(
            priceConsumer_ != address(0),
            "PriceConsumer address can not be zero."
        );

        require(
            beneficiaries_.length == amounts_.length,
            "Length of input arrays do not match."
        );
        require(duration > 0, "duraction should be greater than zeo");
        require(
            start.add((duration).mul(SECONDS_PER_DAY)) > block.timestamp,
            "start unix time should be greater than current block timestamp"
        );

        // init beneficiaries
        for (uint256 i = 0; i < beneficiaries_.length; i++) {
            require(
                beneficiaries_[i] != address(0),
                "Beneficiary cannot be 0 address."
            );

            require(amounts_[i] > 0, "Cannot allocate zero amount.");

            // store all beneficiaries address
            _allBeneficiary.push(beneficiaries_[i]);

            // Add new allocation to beneficiaryAllocations
            _beneficiaryAllocations[beneficiaries_[i]] = Allocation(
                amounts_[i],
                0,
                false,
                true
            );

            emit AllocationRegistered(beneficiaries_[i], amounts_[i]);
        }

        _token = token_;
        _duration = duration;
        _start = start;
        _interval = interval;
        // init release percentage is 1%
        _advancePercentage = 1;
        _oracle = IOracle(oracle_);
        _priceConsumer = IPriceConsumerV3(priceConsumer_);
        _lastPriceUnlockDay = 0;
        _nextPriceUnlockStep = 0;
        _maxPriceUnlockMoveStep = 1;
        _pauseClaim = false;

        // init price percentage
        _priceKey = [500000, 800000, 1100000, 1400000, 1700000, 2000000, 2300000, 2600000, 2900000, 3200000, 3500000, 3800000, 4100000,
                    4400000, 4700000, 5000000, 5300000, 5600000, 5900000, 6200000, 6500000];
        _percentageValue = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

        for (uint256 i = 0; i < _priceKey.length; i++) {
            _pricePercentageMapping[_priceKey[i]] = _percentageValue[i];
        }

        // Make the deployer defaul admin role and manager role
        _setupRole(MANAGER_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(MANAGER_ROLE, ADMIN_ROLE);
    }

    fallback() external payable {
        revert();
    }

    /**
     * @return the start time of the token vesting. in unix
     */
    function start() public view returns (uint256) {
        return _start;
    }

    /**
     * @return the duration of the token vesting. in day
     */
    function duration() public view returns (uint256) {
        return _duration;
    }

    /**
     * @return the registerd state.
     */
    function getRegisteredStatus(address userAddress) public view returns (bool) {
        return _beneficiaryAllocations[userAddress].isRegistered;
    }

    function getUserVestingAmount(address userAddress) public view returns (uint256) {
        return _beneficiaryAllocations[userAddress].amount;
    }

    function getUserAvailableAmount(address userAddress, uint256 onDayOrToday) public view returns (uint256) {
        uint256 avalible =
            _getVestedAmount(userAddress, onDayOrToday).sub(
                _beneficiaryAllocations[userAddress].released
            );
        return avalible;
    }

    function getUserVestedAmount(address userAddress, uint256 onDayOrToday)
        public
        view
        returns (uint256 amountVested)
    {
        return _getVestedAmount(userAddress, onDayOrToday);
    }

    /**
     * @dev returns the day number of the current day, in days since the UNIX epoch.
     */
    function today() public view virtual returns (uint256 dayNumber) {
        return uint256(block.timestamp / SECONDS_PER_DAY);
    }

    function startDay() public view returns (uint256) {
        return uint256(_start / SECONDS_PER_DAY);
    }

    function _effectiveDay(uint256 onDayOrToday) internal view returns (uint256) {
        return onDayOrToday == 0 ? today() : onDayOrToday;
    }

    function _getVestedAmount(address userAddress, uint256 onDayOrToday) internal view returns (uint256) {
        uint256 onDay = _effectiveDay(onDayOrToday); // day

        // If after end of vesting, then the vested amount is total amount.
        if (onDay >= (startDay() + _duration)) {
            return _beneficiaryAllocations[userAddress].amount;
        }
        // If it's before the vesting then the vested amount is zero.
        else if (onDay < startDay()) {
            // All are vested (none are not vested)
            return 0;
        }
        // Otherwise a fractional amount is vested.
        else {
            // Compute the exact number of days vested.
            uint256 daysVested = onDay - startDay();
            // Adjust result rounding down to take into consideration the interval.
            uint256 effectiveDaysVested = (daysVested / _interval) * _interval;

            // Compute the fraction vested from schedule using 224.32 fixed point math for date range ratio.
            // Note: This is safe in 256-bit math because max value of X billion tokens = X*10^27 wei, and
            // typical token amounts can fit into 90 bits. Scaling using a 32 bits value results in only 125
            // bits before reducing back to 90 bits by dividing. There is plenty of room left, even for token
            // amounts many orders of magnitude greater than mere billions.

            uint256 vested = 0;

            if (
                _beneficiaryAllocations[userAddress]
                    .amount
                    .mul(effectiveDaysVested)
                    .div(_duration) >
                _beneficiaryAllocations[userAddress]
                    .amount
                    .mul(_advancePercentage)
                    .div(100)
            ) {
                // no price based percentage > date based percentage
                vested = _beneficiaryAllocations[userAddress]
                    .amount
                    .mul(effectiveDaysVested)
                    .div(_duration);
            } else {
                // price based percentage > date based percentage
                vested = _beneficiaryAllocations[userAddress]
                    .amount
                    .mul(_advancePercentage)
                    .div(100);
            }

            return vested;
        }
    }

    /**
    withdraw function
   */
    function withdraw(uint256 withdrawAmount) public {
        address userAddress = msg.sender;

        require(
            _beneficiaryAllocations[userAddress].isRegistered == true,
            "You have to be a registered address in order to release tokens."
        );

        require(
            _beneficiaryAllocations[userAddress].blackListed == false,
            "Your address is blacklisted"
        );

        require(
            _pauseClaim == false,
            "Cook token is not claimable due to emgergency"
        );

        require(
            getUserAvailableAmount(userAddress, today()) >= withdrawAmount,
            "insufficient avalible cook balance"
        );

        _beneficiaryAllocations[userAddress].released = _beneficiaryAllocations[
            userAddress
        ]
            .released
            .add(withdrawAmount);

        _token.safeTransfer(userAddress, withdrawAmount);

        emit TokensWithdrawal(userAddress, withdrawAmount);
    }

    function _getPricePercentage(uint256 priceKey) internal view returns (uint256) {
        return _pricePercentageMapping[priceKey];
    }

    function calWethAmountToPairCook(uint256 cookAmount) public view returns (uint256, address) {
        // get pair address
        IUniswapV2Pair lpPair = IUniswapV2Pair(_oracle.pairAddress());
        uint256 reserve0;
        uint256 reserve1;
        address weth;

        if (lpPair.token0() == address(_token)) {
            (reserve0, reserve1, ) = lpPair.getReserves();
            weth = lpPair.token1();
        } else {
            (reserve1, reserve0, ) = lpPair.getReserves();
            weth = lpPair.token0();
        }

        uint256 wethAmount =
            (reserve0 == 0 && reserve1 == 0)
                ? cookAmount
                : UniswapV2Library.quote(cookAmount, reserve0, reserve1);

        return (wethAmount, weth);
    }

    // Zap into LP staking pool functions
    function zapLPWithEth(uint256 cookAmount, uint256 maxETH, address poolAddress, uint256 deadline) external payable {
        _zapLP(cookAmount, maxETH, poolAddress, deadline, true);
    }

    function zapLP(uint256 cookAmount, uint256 maxETH, address poolAddress, uint256 deadline) external {
        _zapLP(cookAmount, maxETH, poolAddress, deadline, false);
    }

    function _zapLP(uint256 cookAmount, uint256 maxETH, address poolAddress, uint256 deadline, bool isWithEth) internal {
        require(deadline >= block.timestamp, "CookDistribution: EXPIRED");

        address userAddress = msg.sender;
        _checkValidZap(userAddress, cookAmount);

        uint256 newUniv2 = 0;

        if (isWithEth) {
            (, newUniv2) = addLiquidityWithEth(cookAmount, maxETH);
        } else {
            (, newUniv2) = addLiquidity(cookAmount, maxETH);
        }

        IERC20(_oracle.pairAddress()).approve(poolAddress, newUniv2);

        IPool(poolAddress).zapStake(newUniv2, userAddress);
    }

    function _checkValidZap(address userAddress, uint256 cookAmount) internal {
        require(_beneficiaryAllocations[userAddress].isRegistered == true, "You have to be a registered address in order to release tokens.");

        require(
            _beneficiaryAllocations[userAddress].blackListed == false,
            "Your address is blacklisted"
        );

        require(_pauseClaim == false, "Cook token cane not be zap due to emgergency");

        require(cookAmount > 0, "zero zap amount");

        require(
            getUserAvailableAmount(userAddress, today()) >= cookAmount, "insufficient avalible cook balance"
        );

        _beneficiaryAllocations[userAddress].released = _beneficiaryAllocations[userAddress].released.add(cookAmount);
    }

    function addLiquidity(uint256 cookAmount, uint256 maxETH) internal returns (uint256, uint256) {
        // get pair address
        (uint256 wethAmount, ) = calWethAmountToPairCook(cookAmount);
        require(maxETH >= wethAmount, "CookDistribution: Limit exceed");

        _token.safeTransfer(_oracle.pairAddress(), cookAmount);

        IUniswapV2Pair lpPair = IUniswapV2Pair(_oracle.pairAddress());
        if (lpPair.token0() == address(_token)) {
            // token0 == cook, token1 == weth
            require(IERC20(lpPair.token1()).balanceOf(msg.sender) >= wethAmount, "insufficient weth balance");
            require(IERC20(lpPair.token1()).allowance(msg.sender, address(this)) >= wethAmount, "insufficient weth allowance");
            IERC20(lpPair.token1()).safeTransferFrom(
                msg.sender,
                _oracle.pairAddress(),
                wethAmount
            );
        } else if (lpPair.token1() == address(_token)) {
            // token0 == weth, token1 == cook
            require(IERC20(lpPair.token0()).balanceOf(msg.sender) >= wethAmount, "insufficient weth balance");
            require(IERC20(lpPair.token0()).allowance(msg.sender, address(this)) >= wethAmount, "insufficient weth allowance");
            IERC20(lpPair.token0()).safeTransferFrom(msg.sender, _oracle.pairAddress(), wethAmount);
        }

        return (wethAmount, lpPair.mint(address(this)));
    }

    function addLiquidityWithEth(uint256 cookAmount, uint256 maxETH) internal returns (uint256, uint256) {
        (uint256 wethAmount, address wethAddress) =
            calWethAmountToPairCook(cookAmount);
        require(maxETH >= wethAmount, "CookDistribution: Limit exceed");
        require(msg.value >= wethAmount, "Please provide sufficient amount of eth needed to pair cook tokens");

        // Swap ETH to WETH for user
        IWETH(wethAddress).deposit{value: wethAmount}();
        _token.safeTransfer(_oracle.pairAddress(), cookAmount);

        IUniswapV2Pair lpPair = IUniswapV2Pair(_oracle.pairAddress());
        if (lpPair.token0() == address(_token)) {
            // token0 == cook, token1 == weth
            require(IERC20(lpPair.token1()).balanceOf(address(this)) >= wethAmount, "insufficient weth balance");
            IERC20(lpPair.token1()).safeTransferFrom(
                address(this),
                _oracle.pairAddress(),
                wethAmount
            );
        } else if (lpPair.token1() == address(_token)) {
            // token0 == weth, token1 == cook
            require(IERC20(lpPair.token0()).balanceOf(address(this)) >= wethAmount, "insufficient weth balance");
            IERC20(lpPair.token0()).safeTransferFrom(address(this), _oracle.pairAddress(), wethAmount);
        }

        if (msg.value > wethAmount) {
            _safeTransferETH(msg.sender, msg.value.sub(wethAmount));
        }

        return (wethAmount, lpPair.mint(address(this)));
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, 'CookDistribution: ETH transfer failed');
    }

    // Zap into Cook staking pool functions
    function zapCook(uint256 cookAmount, address cookPoolAddress) external {
        address userAddress = msg.sender;
        _checkValidZap(userAddress, cookAmount);
        IERC20(address(_token)).approve(cookPoolAddress, cookAmount);
        IPool(cookPoolAddress).zapStake(cookAmount, userAddress);
    }

    // Admin Functions
    function setPriceBasedMaxStep(uint32 newMaxPriceBasedStep) public {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");
        _maxPriceUnlockMoveStep = newMaxPriceBasedStep;
    }

    function getPriceBasedMaxSetp() public view returns (uint32) {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");
        return _maxPriceUnlockMoveStep;
    }

    function getNextPriceUnlockStep() public view returns (uint32) {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");
        return _nextPriceUnlockStep;
    }

    /**
     * add adddress with allocation
     */
    function addAddressWithAllocation(address beneficiaryAddress, uint256 amount ) public  {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");

        require(
            _beneficiaryAllocations[beneficiaryAddress].isRegistered == false,
            "The address to be added already exisits in the distribution contact, please use a new one"
        );

        _beneficiaryAllocations[beneficiaryAddress].isRegistered = true;
        _beneficiaryAllocations[beneficiaryAddress] = Allocation( amount, 0, false, true
        );

        emit AllocationRegistered(beneficiaryAddress, amount);
    }

    /**
     * Add multiple address with multiple allocations
     */
    function addMultipleAddressWithAllocations(address[] memory beneficiaryAddresses, uint256[] memory amounts) public {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");

        require(beneficiaryAddresses.length > 0 && amounts.length > 0 && beneficiaryAddresses.length == amounts.length,
            "The length of user addressed and amounts should be matched and cannot be empty"
        );

        for (uint256 i = 0; i < beneficiaryAddresses.length; i++) {
            require(_beneficiaryAllocations[beneficiaryAddresses[i]].isRegistered == false,
                "The address to be added already exisits in the distribution contact, please use a new one"
            );
        }

        for (uint256 i = 0; i < beneficiaryAddresses.length; i++) {
            _beneficiaryAllocations[beneficiaryAddresses[i]].isRegistered = true;
            _beneficiaryAllocations[beneficiaryAddresses[i]] = Allocation(amounts[i], 0, false, true);

            emit AllocationRegistered(beneficiaryAddresses[i], amounts[i]);
        }
    }

    function updatePricePercentage(uint256[] memory priceKey_, uint256[] memory percentageValue_) public {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");

        require(
            priceKey_.length == percentageValue_.length && priceKey_.length > 0,
            "incorrect values are provided for priceKey and percentagekey"
        );

        _priceKey = priceKey_;
        _percentageValue = percentageValue_;

        for (uint256 i = 0; i < _priceKey.length; i++) {
            _pricePercentageMapping[_priceKey[i]] = _percentageValue[i];
        }
    }

    /**
     * return total vested cook amount
     */
    function getTotalAvailable() public view returns (uint256) {uint256 totalAvailable = 0;
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");

        for (uint256 i = 0; i < _allBeneficiary.length; ++i) {
            totalAvailable += getUserAvailableAmount(
                _allBeneficiary[i],
                today()
            );
        }

        return totalAvailable;
    }

    function getLatestSevenSMA() public returns (uint256) {
        // 7 day sma
        uint256 priceSum = uint256(0);
        uint256 priceCount = uint256(0);
        for (uint32 i = 0; i < 7; ++i) {
            if (_oraclePriceFeed[today() - i] != 0) {
                priceSum = priceSum + _oraclePriceFeed[today() - i];
                priceCount += 1;
            }
        }

        uint256 sevenSMA = 0;
        if (priceCount == 7) {
            sevenSMA = priceSum.div(priceCount);
        }
        return sevenSMA;
    }

    /**
     * update price feed and update price-based unlock percentage
     */
    function updatePriceFeed() public {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");

        // oracle capture -> 900000000000000000 -> 1 cook = 0.9 ETH
        uint256 cookPrice = _oracle.update();

        // ETH/USD capture -> 127164849196 -> 1ETH = 1271.64USD
        uint256 ethPrice = uint256(_priceConsumer.getLatestPrice());

        uint256 price = cookPrice.mul(ethPrice).div(10**18);

        // update price to _oraclePriceFeed
        _oraclePriceFeed[today()] = price;

        if (today() >= _lastPriceUnlockDay.add(7)) {
            // 7 day sma
            uint256 sevenSMA = getLatestSevenSMA();
            uint256 priceRef = 0;

            for (uint32 i = 0; i < _priceKey.length; ++i) {
                if (sevenSMA >= _priceKey[i]) {
                    priceRef = _pricePercentageMapping[_priceKey[i]];
                }
            }

            // no lower action if the price drop after price-based unlock
            if (priceRef > _advancePercentage) {
                // guard _nextPriceUnlockStep exceed
                if (_nextPriceUnlockStep >= _percentageValue.length) {
                    _nextPriceUnlockStep = uint32(_percentageValue.length - 1);
                }

                // update _advancePercentage to nextStep percentage
                _advancePercentage = _pricePercentageMapping[
                    _priceKey[_nextPriceUnlockStep]
                ];

                // update nextStep value
                _nextPriceUnlockStep =
                    _nextPriceUnlockStep +
                    _maxPriceUnlockMoveStep;

                // update lastUnlcokDay
                _lastPriceUnlockDay = today();
            }
        }
    }

    // Put an evil address into blacklist
    function blacklistAddress(address userAddress) public {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");
        _beneficiaryAllocations[userAddress].blackListed = true;
    }

    //Remove an address from blacklist
    function removeAddressFromBlacklist(address userAddress) public {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");
        _beneficiaryAllocations[userAddress].blackListed = false;
    }

    // Pause all claim due to emergency
    function pauseClaim() public {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");
        _pauseClaim = true;
    }

    // resume cliamable
    function resumeCliam() public {
        require(hasRole(MANAGER_ROLE, msg.sender), "Caller is not a manager");
        _pauseClaim = false;
    }

    // admin emergency to transfer token to owner
    function emergencyWithdraw(uint256 amount) public onlyOwner {
        _token.safeTransfer(msg.sender, amount);
    }

    function getManagerRole() public returns (bytes32) {
        return MANAGER_ROLE;
    }
}
