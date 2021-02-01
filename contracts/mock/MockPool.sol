pragma solidity ^0.6.2;

import "../core/Pool.sol";
import "./MockCOOK.sol";
import "./MockState.sol";

contract MockPool is Pool, MockState {

    uint256 private _blockNumber;
    uint256 private _blockTimestamp;
    uint256 private _stakeLockupDuration;
    address private _dollar;
    address private _univ2;

    constructor(address dollar, address univ2) Pool(dollar, univ2) public {
        _dollar = dollar;
        _univ2 = univ2;
        _blockNumber = 0;
        _blockTimestamp = 0;
        _stakeLockupDuration = 10;
    }

    function dollar() public override view returns (MockCOOK) {
        return MockCOOK(_dollar);
    }

    function univ2() public override view returns (IERC20) {
        return IERC20(_univ2);
    }

    /**
     * Mock
     */
    function setBlockNumber(uint256 blockNumber) external {
        _blockNumber = blockNumber;
    }

    function blockNumber() internal override view returns (uint256) {
        return _blockNumber;
    }

    function blockNumberE() external view returns (uint256) {
        return _blockNumber;
    }

    function setBlockTimestamp(uint256 blockTimestamp) external {
        _blockTimestamp = blockTimestamp;
    }

    function blockTimestamp() internal override view returns (uint256) {
        return _blockTimestamp;
    }

    function setStakeLockupDuration(uint256 stakeLockupDuration) external {
        _stakeLockupDuration = stakeLockupDuration;
    }

    function getStakeLockupDuration() public override view returns (uint256) {
        return _stakeLockupDuration;
    } 
}