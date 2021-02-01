pragma solidity ^0.6.2;
pragma experimental ABIEncoderV2;

import "../oracle/IPriceConsumerV3.sol";

contract MockSettablePriceConsumerV3 is IPriceConsumerV3 {
    int internal _price;

    function set(int price) external {
        _price = price;
    }

    function getLatestPrice() override public view returns (int price) {
        return _price;
    }

}
