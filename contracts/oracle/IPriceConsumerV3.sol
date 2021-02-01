pragma solidity ^0.6.2;
pragma experimental ABIEncoderV2;

abstract contract IPriceConsumerV3 {
    function getLatestPrice() virtual public view returns (int);
}
