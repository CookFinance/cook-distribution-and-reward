/*
    Copyright 2021 Cook Finance.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

    SPDX-License-Identifier: Apache License, Version 2.0
*/
pragma solidity ^0.6.2;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract ReferralReward is Ownable {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

   
    event UpdateRewardsEvent(address _user, uint256 _oldRewardBalance, uint256 _addRewardBalance, uint256 _newRewardBalance);
    event TransferRewardEvent(address _user, uint256 _rewardsAmountToAdd);
    event ClaimRewardEvent(address _user, uint256 _amount);



    IERC20 public reward;

    mapping(address => uint) public userRewardBalance;


    constructor(IERC20 _reward) public {
      reward = _reward;
    }

    function transferAdmin(address _admin)  public onlyOwner {
        transferOwnership(_admin); 
    }

    function updateRewards(address _user, uint256 _rewardsAmountToAdd) public onlyOwner {
        uint256 oldRewardBalance = userRewardBalance[_user];
        userRewardBalance[_user] = oldRewardBalance + _rewardsAmountToAdd;
        emit UpdateRewardsEvent(_user, oldRewardBalance, _rewardsAmountToAdd, userRewardBalance[_user]);  
    }

    function transferReward(address _user, uint256 _amount)  public onlyOwner {
        reward.safeTransfer(_user, _amount);
        emit TransferRewardEvent(msg.sender, _amount);
    }

    function claim() external {
        uint256 userReward = userRewardBalance[msg.sender];
        reward.safeTransfer(msg.sender, userReward);
        userRewardBalance[msg.sender] = 0;
        emit ClaimRewardEvent(msg.sender, userReward);
    }
}