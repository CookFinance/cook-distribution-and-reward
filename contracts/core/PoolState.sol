pragma solidity ^0.6.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../mock/MockCOOK.sol";

contract Account {
    struct State {
        uint256 staked; //LP
        uint256 phantom;
        Vesting[] vestings;
        Vesting[] stakings;
        uint256 claimed; //cook
    }
}

struct Vesting {
    uint256 start;
    uint256 amount; //cook
}

contract Storage {
    struct Provider {
        MockCOOK dollar;
        IERC20 univ2;

    }

    struct Balance {
        uint256 staked; //LP
        uint256 rewarded; //cook
        uint256 claimed; //cook
        uint256 vesting; //cook
        uint256 phantom;
    }

    struct State {
        Balance balance;
        Provider provider;
        uint256 lastRewardBlock;

        mapping(address => Account.State) accounts;
    }
}

contract PoolState {
    Storage.State _state;
}
