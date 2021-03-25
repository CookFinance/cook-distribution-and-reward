import { ethers } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";

import { MockCOOK } from "../typechain/MockCOOK";
import { MockPool } from "../typechain/MockPool";
import { MockCookPool } from "../typechain/MockCookPool";

chai.use(solidity);

const { expect } = chai;

const getAddress = async (signer: Signer) => {
  return await signer.getAddress();
}

async function latest(addtime: number = 0) {
  const block = await ethers.provider.send("eth_getBlockByNumber", ['latest', false]);
  return ethers.BigNumber.from(block.timestamp).add(addtime);
}

const INITIAL_STAKE_MULTIPLE = 1e6;
const REWARD_PER_BLOCK = 1000;
const STAKE_LOCKUP_DURATION = 10;
const VESTING_DURATION = 180;

describe("CookPool", function () {
  let cookInstance: MockCOOK;
  let cookPoolInstance: MockCookPool;

  let owner: Signer;
  let userA: Signer;
  let userB: Signer;

  let addrUserA: Promise<string>;
  let addrUserB: Promise<string>;

  beforeEach(async function () {
    [owner, userA, userB] = await ethers.getSigners();
    [addrUserA, addrUserB] = [userA, userB].map(signer => {
      return getAddress(signer)
    })

    const cookFactory = await ethers.getContractFactory(
      "MockCOOK",
      owner
    );
    cookInstance = (await cookFactory.deploy("1000000000000000000000000")) as MockCOOK;
    this.cook = await cookInstance.deployed();
    this.cook.connect(owner).mint(await owner.getAddress(), '10000000000000000000000');

    const cookPpoolFactory = await ethers.getContractFactory(
      "MockCookPool",
      owner
    );

    cookPoolInstance = (await cookPpoolFactory.deploy(cookInstance.address, STAKE_LOCKUP_DURATION, VESTING_DURATION, REWARD_PER_BLOCK)) as MockCookPool;
    this.cookPool = await cookPoolInstance.deployed();
    this.cookPool.setBlockNumber(0);

    this.cook.connect(owner).mint(await cookPoolInstance.address, '1000000000000000000000000');
  });

  describe('Init', function () {
    it('has correct initial states', async function () {
      expect(await this.cookPool.blockNumberE()).to.be.equal(0);
      expect(await this.cookPool.lastRewardBlock()).to.be.equal(0);
      expect(await this.cookPool.totalStaked()).to.be.equal(0);
      expect(await this.cookPool.totalRewarded()).to.be.equal(0);
      expect(await this.cookPool.totalClaimed()).to.be.equal(0);
      expect(await this.cookPool.totalVesting()).to.be.equal(0);
      expect(await this.cookPool.totalPhantom()).to.be.equal(0);
      expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(0);
      expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.cookPool.balanceOfPhantom(addrUserA)).to.be.equal(0);
      expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(0);
      expect(await this.cookPool.balanceOfClaimed(addrUserA)).to.be.equal(0);
      expect(await this.cookPool.balanceOfVesting(addrUserA)).to.be.equal(0);
      expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.cookPool.getStakeLockupDuration()).to.be.equal(STAKE_LOCKUP_DURATION);
      expect(await this.cookPool.getRewardPerBlock()).to.be.equal(REWARD_PER_BLOCK);
    });
  });

  describe('Stake', function () {
    const initialBlockNumber = 0;

    describe('Admin functions', function () {
      beforeEach('set initial block number and userA has 20 cook', async function () {
        await this.cookPool.setBlockNumber(initialBlockNumber);
        expect(await this.cookPool.blockNumberE()).to.be.equal(initialBlockNumber);
        expect(await this.cookPool.lastRewardBlock()).to.be.equal(initialBlockNumber);

        await this.cook.connect(owner).transfer(addrUserA, 20);
        expect(await this.cook.balanceOf(addrUserA)).to.be.equal(20);
        await this.cook.connect(userA).approve(this.cookPool.address, 20);

        await this.cook.connect(owner).transfer(addrUserB, 20);
        expect(await this.cook.balanceOf(addrUserB)).to.be.equal(20);
        await this.cook.connect(userB).approve(this.cookPool.address, 20);
      });

      it('only admin can set reward per block and cap limit', async function () {
        await expect(cookPoolInstance.connect(userA).setRewardPerBlock(2000)).to.be.reverted;

        expect(await cookPoolInstance.connect(userA).getRewardPerBlock()).to.be.equal(REWARD_PER_BLOCK)
        await expect(cookPoolInstance.connect(userA).setRewardPerBlock(2000)).to.be.reverted;
        expect(await cookPoolInstance.connect(userA).getRewardPerBlock()).to.be.equal(REWARD_PER_BLOCK)

        await expect(cookPoolInstance.connect(owner).setRewardPerBlock(2000))
        expect(await cookPoolInstance.connect(owner).getRewardPerBlock()).to.be.equal(2000)

        expect(await cookPoolInstance.connect(userA).totalPoolCapLimit()).to.be.equal(0) // no limit in mock pool init
        expect(await cookPoolInstance.connect(userA).stakeLimitPerAddress()).to.be.equal(0) // no limit in mock pool init

        await expect(cookPoolInstance.connect(userA).setTotalPoolCapLimit(2000)).to.be.reverted;
        await expect(cookPoolInstance.connect(userA).setStakeLimitPerAddress(2000)).to.be.reverted;

        await cookPoolInstance.connect(owner).setTotalPoolCapLimit(4000)
        await cookPoolInstance.connect(owner).setStakeLimitPerAddress(4000)

        expect(await cookPoolInstance.connect(userA).totalPoolCapLimit()).to.be.equal(4000)
        expect(await cookPoolInstance.connect(userA).stakeLimitPerAddress()).to.be.equal(4000)
      });

      it('pause cook mining', async function () {
        await expect(cookPoolInstance.connect(userA).pauseMinigReward()).to.be.reverted;

        await expect(cookPoolInstance.connect(owner).pauseMinigReward())
        expect(await cookPoolInstance.connect(userA).getRewardPerBlock()).to.be.equal(0)
        await expect(this.cookPool.connect(userA).stake(10)).to.be.revertedWith("liquidity mining program is paused due to some emergency, please stay tuned");

        await expect(cookPoolInstance.connect(userA).resumeMiningReward(REWARD_PER_BLOCK)).to.be.reverted;
        await expect(cookPoolInstance.connect(owner).resumeMiningReward(REWARD_PER_BLOCK))
        expect(await cookPoolInstance.connect(userA).getRewardPerBlock()).to.be.equal(REWARD_PER_BLOCK)

        await expect(cookPoolInstance.connect(userA).blacklistAddress(await userB.getAddress())).to.be.reverted;
        await cookPoolInstance.connect(owner).blacklistAddress(await userB.getAddress());

        await expect(this.cookPool.connect(userB).stake(10)).to.be.revertedWith("Your address is blacklisted, you can not claim/harvet/zap cook reward, but you can withdraw you LP tokens");
        await expect(this.cookPool.connect(userB).claim(10)).to.be.revertedWith("Your address is blacklisted, you can not claim/harvet/zap cook reward, but you can withdraw you LP tokens");
        await expect(this.cookPool.connect(userB).harvest(10)).to.be.revertedWith("Your address is blacklisted, you can not claim/harvet/zap cook reward, but you can withdraw you LP tokens");

        await expect(cookPoolInstance.connect(userA).removeAddressFromBlacklist(await userB.getAddress())).to.be.reverted;
        expect(await cookPoolInstance.connect(owner).removeAddressFromBlacklist(await userB.getAddress()));

        await expect(this.cookPool.connect(userB).stake(10))
          .to.emit(this.cookPool, 'Stake')
          .withArgs(await userB.getAddress(), 10);
      })

      it('Emergent withdraw', async function () {
        await expect(cookPoolInstance.connect(userA).emergencyWithdraw('1000000000000000000000000')).to.be.reverted;
        await cookPoolInstance.connect(owner).emergencyWithdraw('1000000000000000000000000');
        expect(await this.cook.balanceOf(cookPoolInstance.address)).to.be.equal(0);
      })

      it('Access control', async function () {
        await expect(cookPoolInstance.connect(userA).blacklistAddress(await userB.getAddress())).to.be.reverted;
        await expect(cookPoolInstance.connect(userA).removeAddressFromBlacklist(await userB.getAddress())).to.be.reverted;
        await expect(cookPoolInstance.connect(userA).pauseMinigReward()).to.be.reverted;
        await expect(cookPoolInstance.connect(userA).resumeMiningReward(1)).to.be.reverted;
        await expect(cookPoolInstance.connect(userA).setRewardPerBlock(1)).to.be.reverted;
        await expect(cookPoolInstance.connect(userA).setTotalPoolCapLimit(100)).to.be.reverted;
        await expect(cookPoolInstance.connect(userA).setStakeLimitPerAddress(100)).to.be.reverted;

        await expect(cookPoolInstance.connect(userA).grantRole(await cookPoolInstance.MANAGER_ROLE(), await userB.getAddress())).to.be.reverted;
        await expect(cookPoolInstance.connect(userA).grantRole(await cookPoolInstance.ADMIN_ROLE(), await userB.getAddress())).to.be.reverted;
        await cookPoolInstance.connect(owner).grantRole(await cookPoolInstance.MANAGER_ROLE(), await userA.getAddress())
        cookPoolInstance.connect(userA).pauseMinigReward()
      })
    });

    describe('Without approve', function () {
      beforeEach('set initial block number and userA has 20 cook', async function () {
        await this.cookPool.setBlockNumber(initialBlockNumber);
        expect(await this.cookPool.blockNumberE()).to.be.equal(initialBlockNumber);
        expect(await this.cookPool.lastRewardBlock()).to.be.equal(initialBlockNumber);

        await this.cook.connect(owner).transfer(addrUserA, 20);
        expect(await this.cook.balanceOf(addrUserA)).to.be.equal(20);
      });

      it('should not be able to stake any amount', async function () {
        await expect(this.cookPool.connect(userA).stake(1)).to.be.reverted;
      });
    });

    describe('With approve', function () {
      beforeEach('set initial block number and userA approves 20 cook', async function () {
        await this.cookPool.setBlockNumber(initialBlockNumber);
        expect(await this.cookPool.blockNumberE()).to.be.equal(initialBlockNumber);
        expect(await this.cookPool.lastRewardBlock()).to.be.equal(initialBlockNumber);

        await this.cook.connect(owner).transfer(addrUserA, 20);
        expect(await this.cook.balanceOf(addrUserA)).to.be.equal(20);
        await this.cook.connect(userA).approve(this.cookPool.address, 20);

        await this.cook.connect(owner).transfer(addrUserB, 20);
        expect(await this.cook.balanceOf(addrUserB)).to.be.equal(20);
        await this.cook.connect(userB).approve(this.cookPool.address, 20);
      });

      it('Cap limit', async function () {
        await cookPoolInstance.connect(owner).setTotalPoolCapLimit(10);
        await expect(cookPoolInstance.connect(userA).stake(20)).to.be.revertedWith('The amount to be staked will exceed pool limit');

        await cookPoolInstance.connect(owner).setTotalPoolCapLimit(100);
        await cookPoolInstance.connect(owner).setStakeLimitPerAddress(10);
        await expect(cookPoolInstance.connect(userA).stake(20)).to.be.revertedWith('The amount to be staked will exceed per address stake limit');

        await cookPoolInstance.connect(owner).setStakeLimitPerAddress(100);
        await expect(this.cookPool.connect(userA).stake(10))
          .to.emit(this.cookPool, 'Stake')
          .withArgs(await userA.getAddress(), 10);
      })

      it('should not be able to stake zero or negative amount', async function () {
        await expect(this.cookPool.connect(userA).stake(-10)).to.be.reverted;
        await expect(this.cookPool.connect(userA).stake(0)).to.be.revertedWith("zero stake cook amount");
      });

      it('should emit Stake event with correct amount', async function () {
        await expect(this.cookPool.connect(userA).stake(10))
          .to.emit(this.cookPool, 'Stake')
          .withArgs(await userA.getAddress(), 10);
      });

      describe('With no lockup', function () {
        const stakeAmount = 10;
        const newBlockNumber = 1;

        beforeEach('set stake lockup duration to 0 and userA stakes some amount', async function () {
          await this.cookPool.setStakeLockupDuration(0);
          await this.cookPool.setBlockNumber(newBlockNumber);
          await this.cookPool.connect(userA).stake(stakeAmount);
        });

        it('should be able to unstake at any time', async function () {
          expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(stakeAmount);
        });

        it('should have the correct states', async function () {
          expect(await this.cookPool.totalRewarded()).to.be.equal(0);
          expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(0);
          expect(await this.cookPool.lastRewardBlock()).to.be.equal(newBlockNumber);
          expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(stakeAmount);
          expect(await this.cookPool.totalStaked()).to.be.equal(stakeAmount);
          expect(await this.cookPool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE * stakeAmount);
          expect(await this.cookPool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE * stakeAmount);
        });
      });

      describe('With stake lockup', function () {
        const stakeAmount = 10;
        const initialTimestamp = 1598400000;
        const lastRewardBlock = initialBlockNumber;

        beforeEach('userA stakes inital amount', async function () {
          await this.cookPool.setBlockNumber(initialBlockNumber);
          await this.cookPool.setBlockTimestamp(initialTimestamp);
          await this.cookPool.connect(userA).stake(stakeAmount);
        });

        it('should not be able to unstake right after staking', async function () {
          expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
        });

        it('should have the correct states', async function () {
          expect(await this.cookPool.totalRewarded()).to.be.equal(0);
          expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(0);
          expect(await this.cookPool.lastRewardBlock()).to.be.equal(lastRewardBlock);
          expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(stakeAmount);
          expect(await this.cookPool.totalStaked()).to.be.equal(stakeAmount);
          expect(await this.cookPool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE * stakeAmount);
          expect(await this.cookPool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE * stakeAmount);
        });

        it('should be unlocked after lockup duration', async function () {
          await this.cookPool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION - 1)); //before lockup period
          expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(0);

          await this.cookPool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION)); //after lockup period
          expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(stakeAmount);
        });

        it('same user stakes again and should have the correct reward/phantom calculation', async function () {
          const newBlockNumber = 2;
          const newStakeAmount = 5;
          const previousStakeAmount = stakeAmount;
          let totalStakeAmount = stakeAmount + newStakeAmount;
          await this.cookPool.setBlockNumber(newBlockNumber);
          await this.cookPool.connect(userA).stake(newStakeAmount);

          let expectedReward = (newBlockNumber - lastRewardBlock) * REWARD_PER_BLOCK;
          expect(await this.cookPool.totalRewarded()).to.be.equal(expectedReward);
          expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);
          expect(await this.cookPool.lastRewardBlock()).to.be.equal(newBlockNumber);
          expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(totalStakeAmount);
          expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
          expect(await this.cookPool.totalStaked()).to.be.equal(totalStakeAmount);
          let expectedNewPhantom = (expectedReward + INITIAL_STAKE_MULTIPLE * previousStakeAmount) * newStakeAmount / previousStakeAmount;
          let oldPhantom = INITIAL_STAKE_MULTIPLE * previousStakeAmount;
          let expectedPhantom = oldPhantom + expectedNewPhantom;
          expect(await this.cookPool.balanceOfPhantom(addrUserA)).to.be.equal(expectedPhantom);
          expect(await this.cookPool.totalPhantom()).to.be.equal(expectedPhantom);
        });

        it('different user stakes and each of them should have the correct reward/phantom calculation', async function () {
          const newBlockNumber = 2;
          const newStakeAmount = 5;
          const previousStakeAmount = stakeAmount;
          let totalStakeAmount = stakeAmount + newStakeAmount;
          await this.cookPool.setBlockNumber(newBlockNumber);
          await this.cookPool.connect(userB).stake(newStakeAmount);

          let expectedReward = (newBlockNumber - lastRewardBlock) * REWARD_PER_BLOCK;
          expect(await this.cookPool.totalRewarded()).to.be.equal(expectedReward);
          expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);
          expect(await this.cookPool.balanceOfRewarded(addrUserB)).to.be.equal(0);
          expect(await this.cookPool.lastRewardBlock()).to.be.equal(newBlockNumber);
          expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(previousStakeAmount);
          expect(await this.cookPool.balanceOfStaked(addrUserB)).to.be.equal(newStakeAmount);
          expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
          expect(await this.cookPool.totalStaked()).to.be.equal(totalStakeAmount);
          let expectedNewPhantom = (expectedReward + INITIAL_STAKE_MULTIPLE * previousStakeAmount) * newStakeAmount / previousStakeAmount;
          let oldPhantom = INITIAL_STAKE_MULTIPLE * previousStakeAmount;
          let expectedPhantom = oldPhantom + expectedNewPhantom;
          expect(await this.cookPool.balanceOfPhantom(addrUserA)).to.be.equal(oldPhantom);
          expect(await this.cookPool.balanceOfPhantom(addrUserB)).to.be.equal(expectedNewPhantom);
          expect(await this.cookPool.totalPhantom()).to.be.equal(expectedPhantom);
        });
      });
    });
  });

  describe('Unstake', function () {
    const initialBlockNumber = 0;
    const initialTimestamp = 1598400000;
    const stakeAmount = 10;

    beforeEach('set initial block number and userA stakes 10 univ2', async function () {
      await this.cookPool.setBlockNumber(initialBlockNumber);
      await this.cookPool.setBlockTimestamp(initialTimestamp);

      await this.cook.connect(owner).transfer(addrUserA, stakeAmount);
      await this.cook.connect(userA).approve(this.cookPool.address, stakeAmount);
      await this.cookPool.connect(userA).stake(stakeAmount);
    });

    describe('during lockup period', function () {
      it('should not be able to unstake', async function () {
        await this.cookPool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION - 1)); //during lockup period
        expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
        await expect(this.cookPool.connect(userA).unstake(stakeAmount)).to.be.revertedWith("insufficient unstakable balance");
      });
    });

    describe('after lockup period', function () {
      beforeEach('advance after lockup', async function () {
        await this.cookPool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION)); //after lockup period
      });

      it('should be able to unstake', async function () {
        expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(stakeAmount);
        await expect(this.cookPool.connect(userA).unstake(stakeAmount)).to.not.be.reverted;
      });

      it('should not be able to unstake zero or negative amount', async function () {
        await expect(this.cookPool.connect(userA).unstake(-10)).to.be.reverted;
        await expect(this.cookPool.connect(userA).unstake(0)).to.be.revertedWith("zero unstake cook amount");
      });

      it('should emit the Unstake event with correct amount', async function () {
        await expect(this.cookPool.connect(userA).unstake(stakeAmount))
          .to.emit(this.cookPool, 'Unstake')
          .withArgs(await userA.getAddress(), stakeAmount);
      });

      it('unstake half of the staked amount and should have the correct states', async function () {
        const newBlockNumber = 10;

        await this.cookPool.setBlockNumber(newBlockNumber);
        await this.cookPool.connect(userA).unstake(stakeAmount / 2);

        expect(await this.cook.balanceOf(addrUserA)).to.be.equal(stakeAmount / 2);
        expect(await this.cookPool.totalRewarded()).to.be.equal(REWARD_PER_BLOCK * (newBlockNumber - initialBlockNumber) / 2);
        expect(await this.cookPool.lastRewardBlock()).to.be.equal(newBlockNumber);
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.cookPool.balanceOfVesting(addrUserA)).to.equal(REWARD_PER_BLOCK * (newBlockNumber - initialBlockNumber) / 2);
        expect(await this.cookPool.totalVesting()).to.equal(REWARD_PER_BLOCK * (newBlockNumber - initialBlockNumber) / 2);
        expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(stakeAmount / 2);
        expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(stakeAmount / 2);
        expect(await this.cookPool.totalStaked()).to.be.equal(stakeAmount / 2);
        expect(await this.cookPool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE * (stakeAmount / 2));
        expect(await this.cookPool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE * (stakeAmount / 2));
      });

      it('stake more but can only unstake the initial unlocked amount', async function () {
        const newStakeAmount = 20;
        const previousStakeAmount = stakeAmount;
        let totalStakeAmount = stakeAmount + newStakeAmount;
        await this.cook.connect(owner).transfer(addrUserA, newStakeAmount);
        await this.cook.connect(userA).approve(this.cookPool.address, newStakeAmount);
        await this.cookPool.connect(userA).stake(newStakeAmount);

        expect(await this.cookPool.balanceOfUnstakable(addrUserA)).to.be.equal(previousStakeAmount);
        await expect(this.cookPool.connect(userA).unstake(totalStakeAmount)).to.be.revertedWith("insufficient unstakable balance");
      });
    });
  });

  describe('Harvest', function () {
    const initialBlockNumber = 0;
    const initialTimestamp = 1598400000;
    const stakeAmount = 10;

    beforeEach('set initial block number and userA stakes 10 univ2', async function () {
      await this.cookPool.setBlockNumber(initialBlockNumber);
      await this.cook.connect(owner).transfer(addrUserA, 20);
      await this.cook.connect(userA).approve(this.cookPool.address, 20);

      // user A stakes 10 at block number 0
      await this.cookPool.connect(userA).stake(stakeAmount);
    });

    describe('With no vesting duration', function () {
      beforeEach('set vesting duration to 0', async function () {
        await this.cookPool.setVestingDuration(0);
      });

      it('all the rewards should be claimable right after harvest', async function () {
        const newBlockNumber = 60;
        const newStakeAmount = 5;
        await this.cookPool.setBlockNumber(newBlockNumber);
        await this.cookPool.connect(userA).stake(newStakeAmount);

        let expectedReward = (newBlockNumber - initialBlockNumber) * REWARD_PER_BLOCK;
        expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);

        await this.cookPool.setBlockTimestamp(initialTimestamp);
        let harvestAmount = expectedReward;
        await this.cookPool.connect(userA).harvest(harvestAmount);
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(harvestAmount);
      });
    });

    describe('With vesting duration', function () {
      describe('With no reward', async function () {
        it('harvest should be reverted when total reward is 0', async function () {
          expect(await this.cookPool.totalRewarded()).to.be.equal(0);
          expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(0);
          await expect(this.cookPool.connect(userA).harvest(5)).to.be.revertedWith("insufficient total rewarded");
        });

        it('harvest should be reverted when no reward for given user', async function () {
          const newBlockNumber = 10;
          // user B stakes 20 at block number 10
          await this.cook.connect(owner).transfer(addrUserB, 20);
          await this.cook.connect(userB).approve(this.cookPool.address, 20);
          await this.cookPool.setBlockNumber(newBlockNumber);
          await this.cookPool.connect(userB).stake(20);

          let expectedReward = (newBlockNumber - initialBlockNumber) * REWARD_PER_BLOCK;
          expect(await this.cookPool.totalRewarded()).to.be.equal(expectedReward);
          expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);
          expect(await this.cookPool.balanceOfRewarded(addrUserB)).to.be.equal(0);

          await expect(this.cookPool.connect(userB).harvest(5)).to.be.revertedWith("insufficient rewarded balance");
        });
      });

      describe('With reward', async function () {
        const newBlockNumber = 60;
        const newStakeAmount = 5;

        beforeEach('userA stakes 5 at block number 10', async function () {
          await this.cookPool.setBlockNumber(newBlockNumber);
          await this.cookPool.connect(userA).stake(newStakeAmount);
        });

        it('should not be able to harvest zero or negative amount', async function () {
          await expect(this.cookPool.connect(userA).harvest(-10)).to.be.reverted;
          await expect(this.cookPool.connect(userA).harvest(0)).to.be.revertedWith("zero harvest amount");
        });

        it('should be able to harvest and the user state and total state should be updated', async function () {
          let expectedReward = (newBlockNumber - initialBlockNumber) * REWARD_PER_BLOCK;
          let totalStakeAmount = stakeAmount + newStakeAmount;
          expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);

          await this.cookPool.setBlockTimestamp(initialTimestamp);
          let harvestAmount = expectedReward;
          await this.cookPool.connect(userA).harvest(harvestAmount);

          expect(await this.cookPool.totalRewarded()).to.be.equal(0);
          expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(0);
          expect(await this.cookPool.lastRewardBlock()).to.be.equal(newBlockNumber);
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(0);
          expect(await this.cookPool.balanceOfVesting(addrUserA)).to.be.equal(harvestAmount);
          expect(await this.cookPool.totalVesting()).to.be.equal(harvestAmount);
          expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(totalStakeAmount);
          expect(await this.cookPool.totalStaked()).to.be.equal(totalStakeAmount);
          let expectedPhantom = (newBlockNumber - initialBlockNumber) * REWARD_PER_BLOCK / 2 + harvestAmount + INITIAL_STAKE_MULTIPLE * 15;
          expect(await this.cookPool.balanceOfPhantom(addrUserA)).to.be.equal(expectedPhantom);
          expect(await this.cookPool.totalPhantom()).to.be.equal(expectedPhantom);

          await this.cookPool.setBlockTimestamp(1599696000); // 1598400000+(86400*15) after 15 days
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(0);

          await this.cookPool.setBlockTimestamp(1600992000); // 1598400000+(86400*30) after 1 months
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(harvestAmount / 6);

          await this.cookPool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) after 3 months
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(harvestAmount / 2);

          await this.cookPool.setBlockTimestamp(1613952000); // 1598400000+(86400*180) after 6 months
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(harvestAmount);
        });

        it('should emit Harvest event with correct amount', async function () {
          await expect(this.cookPool.connect(userA).harvest(5))
            .to.emit(this.cookPool, 'Harvest')
            .withArgs(await userA.getAddress(), 5);
        });
      });
    });
  });

  describe('Claim', function () {
    const initialBlockNumber = 0;
    const initialTimestamp = 1598400000;
    const initialHarvestAmount = 60;

    describe('With no vesting duration', function () {
      beforeEach('set vesting duration to 0', async function () {
        await this.cookPool.setVestingDuration(0);
      });

      it('should be able to claim all the rewards right after harvest', async function () {
        await this.cookPool.setBlockNumber(initialBlockNumber);
        await this.cook.connect(owner).transfer(addrUserA, 20);
        await this.cook.connect(userA).approve(this.cookPool.address, 20);

        // user A stakes 10 at block number 1
        let newBlockNumber = 1;
        await this.cookPool.setBlockNumber(newBlockNumber);
        await this.cookPool.connect(userA).stake(10);
        let lastRewardBlock = newBlockNumber;

        // user A stakes 5 at block number 61
        newBlockNumber = 61;
        await this.cookPool.setBlockNumber(newBlockNumber);
        await this.cookPool.connect(userA).stake(5);
        let expectedReward = (newBlockNumber - lastRewardBlock) * REWARD_PER_BLOCK;
        expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);

        await this.cookPool.setBlockTimestamp(initialTimestamp);
        await this.cookPool.connect(userA).harvest(expectedReward);

        expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(0);
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(expectedReward);
        expect(await this.cookPool.balanceOfVesting(addrUserA)).to.be.equal(expectedReward);

        await expect(this.cookPool.connect(userA).claim(expectedReward)).to.not.be.reverted;
      });
    });

    describe('With normal vesting duration', function () {
      beforeEach('userA stakes to get rewards and harvests half rewards', async function () {
        await this.cookPool.setBlockNumber(initialBlockNumber);
        await this.cook.connect(owner).transfer(addrUserA, 20);
        await this.cook.connect(userA).approve(this.cookPool.address, 20);

        // user A stakes 10 at block number 1
        let newBlockNumber = 1;
        await this.cookPool.setBlockNumber(newBlockNumber);
        await this.cookPool.connect(userA).stake(10);
        let lastRewardBlock = newBlockNumber;

        // user A stakes 5 at block number 61
        newBlockNumber = 61;
        await this.cookPool.setBlockNumber(newBlockNumber);
        await this.cookPool.connect(userA).stake(5);
        let expectedReward = (newBlockNumber - lastRewardBlock) * REWARD_PER_BLOCK;
        expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);

        await this.cookPool.setBlockTimestamp(initialTimestamp);
        await this.cookPool.connect(userA).harvest(initialHarvestAmount);

        expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward - initialHarvestAmount);
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.cookPool.balanceOfVesting(addrUserA)).to.be.equal(initialHarvestAmount);
      });

      describe('during vesting period', function () {
        beforeEach('advance after half of the vesting schedule', async function () {
          await this.cookPool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) => after 3 months
        });

        it('should be able to claim the the vested amount', async function () {
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount / 2);
          await expect(this.cookPool.connect(userA).claim(initialHarvestAmount / 2)).to.not.be.reverted;
        });

        it('should get reverted if tries to claim the amount more than the claimable', async function () {
          await expect(this.cookPool.connect(userA).claim(initialHarvestAmount / 2 + 5)).to.be.revertedWith("insufficient claimable cook balance");
        });

        it('the balance of claimable for userA should be updated correctly and userA can claim part of the claimable', async function () {
          let claimable = initialHarvestAmount / 2;
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(claimable);

          let claimed = claimable / 2;
          await this.cookPool.connect(userA).claim(claimed);
          let remainingClaimable = claimable - claimed;
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(remainingClaimable);

          let remainingReward = await this.cookPool.balanceOfRewarded(addrUserA);
          let harvestAmount = remainingReward / 1;
          await this.cookPool.connect(userA).harvest(harvestAmount);
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(remainingClaimable);
          expect(await this.cookPool.balanceOfVesting(addrUserA)).to.be.equal(initialHarvestAmount + harvestAmount);

          await this.cookPool.setBlockTimestamp(1613952000); // 1598400000+(86400*180) => after 6 months for the inital harvest and after 3 months for the second harvest
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount + (harvestAmount / 2) - claimed);
        });
      });

      describe('after full vesting', function () {
        beforeEach('advance after full vesting', async function () {
          await this.cookPool.setBlockTimestamp(1613952000); // 1598400000+(86400*180) => after 6 months
        });

        it('should be able to claim the full vesting amount', async function () {
          expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount);
          await expect(this.cookPool.connect(userA).claim(initialHarvestAmount)).to.not.be.reverted;
        });

        it('should not be able to claim zero or negative amount', async function () {
          await expect(this.cookPool.connect(userA).claim(-10)).to.be.reverted;
          await expect(this.cookPool.connect(userA).claim(0)).to.be.revertedWith("zero claim cook amount");
        });

        it('Claim event should be emitted correctly', async function () {
          await expect(this.cookPool.connect(userA).claim(initialHarvestAmount))
            .to.emit(this.cookPool, 'Claim')
            .withArgs(await userA.getAddress(), initialHarvestAmount);
        });
      });
    });
  });

  describe('Zap Cook', function () {
    const initialBlockNumber = 0;
    const initialTimestamp = 1598400000;
    const initialHarvestAmount = 60;

    beforeEach('userA stakes cook to get rewards and harvests half rewards', async function () {
      await this.cookPool.setBlockNumber(initialBlockNumber);
      await this.cook.connect(owner).transfer(addrUserA, 20);
      await this.cook.connect(userA).approve(this.cookPool.address, 20);

      // user A stakes 10 at block number 1
      let newBlockNumber = 1;
      await this.cookPool.setBlockNumber(newBlockNumber);
      await this.cookPool.connect(userA).stake(10);
      let lastRewardBlock = newBlockNumber;

      // user A stakes 5 at block number 61
      newBlockNumber = 61;
      await this.cookPool.setBlockNumber(newBlockNumber);
      await this.cookPool.connect(userA).stake(5);
      let expectedReward = (newBlockNumber - lastRewardBlock) * REWARD_PER_BLOCK;
      expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);

      await this.cookPool.setBlockTimestamp(initialTimestamp);
      await this.cookPool.connect(userA).harvest(initialHarvestAmount);

      expect(await this.cookPool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward - initialHarvestAmount);
      expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.cookPool.balanceOfVesting(addrUserA)).to.be.equal(initialHarvestAmount);
    });

    describe('during vesting period', function () {
      beforeEach('advance after half of the vesting schedule', async function () {
        await this.cookPool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) => after 3 months
      });

      it('should be able to zap the the vested amount', async function () {
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount / 2);
        await this.cookPool.connect(userA).zapCook(initialHarvestAmount / 2)
      });

      it('Cap limit', async function () {
        await cookPoolInstance.connect(owner).setTotalPoolCapLimit(1);
        await expect(cookPoolInstance.connect(userA).zapCook(initialHarvestAmount / 2)).to.be.revertedWith('The amount to be staked will exceed pool limit');

        await cookPoolInstance.connect(owner).setTotalPoolCapLimit(initialHarvestAmount * 2);
        await cookPoolInstance.connect(owner).setStakeLimitPerAddress(1);
        await expect(cookPoolInstance.connect(userA).zapCook(initialHarvestAmount / 2)).to.be.revertedWith('The amount to be staked will exceed per address stake limit');

        await cookPoolInstance.connect(owner).setStakeLimitPerAddress(initialHarvestAmount * 2);
        await this.cookPool.connect(userA).zapCook(initialHarvestAmount / 2);
      });

      it('should not be able to zap zero or negative cook amount', async function () {
        await expect(this.cookPool.connect(userA).zapCook(-10)).to.be.reverted;
        await expect(this.cookPool.connect(userA).zapCook(0)).to.be.revertedWith("zero zap amount");
      });

      it('should get reverted if tries to zap the amount more than the claimable', async function () {
        await expect(this.cookPool.connect(userA).zapCook(initialHarvestAmount / 2 + 5)).to.be.revertedWith("insufficient claimable balance");
      });

      it('the balance of claimable for userA should be updated correctly and userA can zap part of the claimable', async function () {
        let previousStakeAmount = await this.cookPool.balanceOfStaked(addrUserA);
        let claimable = initialHarvestAmount / 2;
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(claimable);

        let zapCookAmount = claimable / 2;
        await this.cookPool.connect(userA).zapCook(zapCookAmount);
        let remainingClaimable = claimable - zapCookAmount;
        let expectedNewCook = zapCookAmount;
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(remainingClaimable);
        expect(await this.cookPool.balanceOfClaimed(addrUserA)).to.be.equal(zapCookAmount);
        expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(previousStakeAmount.add(expectedNewCook));
      });

      it('ZapCook event should be emitted correctly', async function () {
        let zapCookAmount = initialHarvestAmount / 2;
        let expectedCookAmount = zapCookAmount;
        await expect(this.cookPool.connect(userA).zapCook(zapCookAmount))
          .to.emit(this.cookPool, 'ZapCook')
          .withArgs(await userA.getAddress(), expectedCookAmount);
      });
    });

    describe('during vesting period', function () {

      beforeEach('advance after half of the vesting schedule', async function () {
        await this.cookPool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) => after 3 months
      });

      it('should be able to zap the vested amount with ETH', async function () {
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount / 2);
        await this.cookPool.connect(userA).zapCook(initialHarvestAmount / 2);
      });

      it('should not be able to zap zero or negative amount with Cook', async function () {
        await expect(this.cookPool.connect(userA).zapCook(-10000000)).to.be.reverted;
        await expect(this.cookPool.connect(userA).zapCook(0)).to.be.revertedWith("zero zap amount");
      });

      it('should get reverted if tries to zap the cook amount with ETH more than the claimable', async function () {
        await expect(this.cookPool.connect(userA).zapCook(initialHarvestAmount / 2 + 5000000000000000)).to.be.revertedWith("insufficient claimable balance");
      });

      it('the balance of claimable for userA should be updated correctly and userA can zap part of the claimable', async function () {
        let previousStakeAmount = await this.cookPool.balanceOfStaked(addrUserA);
        let claimable = initialHarvestAmount / 2;
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(claimable);

        let zapCookAmount = claimable / 2;
        await this.cookPool.connect(userA).zapCook(zapCookAmount);
        let remainingClaimable = claimable - zapCookAmount;
        let expectedNewUniv2 = zapCookAmount;
        expect(await this.cookPool.balanceOfClaimable(addrUserA)).to.be.equal(remainingClaimable);
        expect(await this.cookPool.balanceOfClaimed(addrUserA)).to.be.equal(zapCookAmount);
        expect(await this.cookPool.balanceOfStaked(addrUserA)).to.be.equal(previousStakeAmount.add(expectedNewUniv2));
      });

      it('ZapCook event should be emitted correctly', async function () {
        let zapCookAmount = initialHarvestAmount / 2;
        let expectedCookAmount = zapCookAmount;
        await expect(this.cookPool.connect(userA).zapCook(zapCookAmount))
          .to.emit(this.cookPool, 'ZapCook')
          .withArgs(await userA.getAddress(), expectedCookAmount);
      });
    });
  });
});
