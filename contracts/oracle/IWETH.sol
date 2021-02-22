pragma solidity ^0.6.2;

abstract contract IWETH {
  function deposit() virtual public payable;
}
