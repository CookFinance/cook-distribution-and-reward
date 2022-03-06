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
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";

contract ReferralReward is Ownable {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    bytes32 private rewardMerkleRoot;
    mapping(address => uint256) private rewardAccountsMap;
    address [] private rewardAccounts;

    event UpdateRewardsEvent();
    event TransferRewardEvent(address _user, uint256 _rewardsAmountToAdd);
    event ClaimRewardEvent(address _user, uint256 _amount);



    IERC20 public reward;

   // mapping(address => uint) public userRewardBalance;


    constructor(IERC20 _reward,  bytes32 _merkleRoot) public {
      reward = _reward;
      rewardMerkleRoot = _merkleRoot;
    }

    function transferAdmin(address _admin)  public onlyOwner {
        transferOwnership(_admin); 
    }

    // function updateRewards(address _user, uint256 _rewardsAmountToAdd) public onlyOwner {
    //     uint256 oldRewardBalance = userRewardBalance[_user];
    //     userRewardBalance[_user] = oldRewardBalance + _rewardsAmountToAdd;
    //     emit UpdateRewardsEvent(_user, oldRewardBalance, _rewardsAmountToAdd, userRewardBalance[_user]);  
    // }

    function updateRewards(bytes32 _merkleRoot) public onlyOwner {
        rewardMerkleRoot = _merkleRoot;
        for (uint i=0; i< rewardAccounts.length ; i++){
            delete rewardAccountsMap[rewardAccounts[i]];
        }
        delete rewardAccounts;
        emit UpdateRewardsEvent();  
    }

    

    function transferReward(address _user, uint256 _amount)  public onlyOwner {
        reward.safeTransfer(_user, _amount);
        emit TransferRewardEvent(msg.sender, _amount);
    }

    function isClaimed(address account) public view  returns (bool) {
        return rewardAccountsMap[account] == 1;
    }

    function _setClaimed(address account) private {
        rewardAccountsMap[account] = 1;
        rewardAccounts.push(account);
    }

    function claim(uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof) external {
        // uint256 userReward = userRewardBalance[msg.sender];
        // reward.safeTransfer(msg.sender, userReward);
        // userRewardBalance[msg.sender] = 0;
        require(!isClaimed(account), 'ReferralReward: Drop already claimed.');

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(MerkleProof.verify(merkleProof, rewardMerkleRoot, node), 'ReferralReward: Invalid proof.');

        // Mark it claimed and send the token.
        _setClaimed(account);
        require(reward.transfer(account, amount), 'ReferralReward: Transfer failed.');
        emit ClaimRewardEvent(msg.sender, amount);
    }
}