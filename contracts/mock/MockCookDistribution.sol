pragma solidity ^0.6.2;

import "../core/CookDistribution.sol";
import "../oracle/IOracle.sol";

contract MockCookDistribution is CookDistribution {
  uint256 internal _today;
  constructor(
    IERC20 token_,
    address[] memory beneficiaries_,
    uint256[] memory amounts_,
    uint256 start, // in unix
    uint256 duration, // in day
    uint32 interval, // in day
    bool revocable,
    address oracle_,
    address priceConsumer_
  ) CookDistribution(token_,beneficiaries_,amounts_,start,duration,interval,revocable,oracle_,priceConsumer_) public {

  }

  function setToday(uint256 dayNumber) public {
      _today = dayNumber;
  }

  function today() public override view returns (uint256 dayNumber) {
      return _today;
  }

  function getVestedAmountE(address userAddress, uint256 onDayOrToday) external view returns (uint256 amountVested)  {
        return super._getVestedAmount(userAddress,onDayOrToday);
  }

  function getPricePercentageMappingE(uint256 priceKey) external view returns (uint256 value)  {
        return super._getPricePercentage(priceKey);
  }

}
