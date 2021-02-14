import { ethers } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";

import { MockCOOK } from "../typechain/MockCOOK";
import { MockPool } from "../typechain/MockPool";
import { TestnetWETH } from "../typechain/TestnetWETH";

chai.use(solidity);

const { expect } = chai;

const UniswapV2FactoryBytecode = require('@uniswap/v2-core/build/UniswapV2Factory.json').bytecode;
const UniswapV2FactoryABI = require('@uniswap/v2-core/build/UniswapV2Factory.json').abi;

const UniswapV2Router02Bytecode = require('@uniswap/v2-periphery/build/UniswapV2Router02.json').bytecode;
const UniswapV2Router02ABI = require('@uniswap/v2-periphery/build/UniswapV2Router02.json').abi;

const getAddress = async(signer:Signer) => {
  return await signer.getAddress();
}

async function latest (addtime:number = 0) {
  const block = await ethers.provider.send("eth_getBlockByNumber",['latest',false]);
  return ethers.BigNumber.from(block.timestamp).add(addtime);
}

const INITIAL_STAKE_MULTIPLE = 1e6;
const REWARD_PER_BLOCK = 1000;
const STAKE_LOCKUP_DURATION = 10;

describe("Pool", function () {
  let cookInstance : MockCOOK;
  let wethInstance : TestnetWETH;
  let poolInstance : MockPool;

  let owner : Signer;
  let userA : Signer;
  let userB : Signer;

  let addrUserA : Promise<string>;
  let addrUserB : Promise<string>;

  beforeEach(async function () {
    [ owner, userA, userB ] = await ethers.getSigners();
    [ addrUserA, addrUserB ] = [ userA, userB ].map(signer => {
      return getAddress(signer)
    })

    const cookFactory = await ethers.getContractFactory(
      "MockCOOK",
      owner
    );
    cookInstance = (await cookFactory.deploy("1000000000000000000000000")) as MockCOOK;
    this.cook = await cookInstance.deployed();

    const wethFactory = await ethers.getContractFactory(
      "TestnetWETH",
      owner
    );
    wethInstance = (await wethFactory.deploy()) as TestnetWETH;
    this.weth = await wethInstance.deployed();

    const uniswapFactory = await ethers.getContractFactory(
      UniswapV2FactoryABI,
      UniswapV2FactoryBytecode,
      owner
    );

    this.uni = await uniswapFactory.deploy(await owner.getAddress());
    this.uniswap = await this.uni.deployed();

    await this.uniswap.connect(owner).createPair(this.cook.address,this.weth.address);

    this.pairAddress = await this.uniswap.connect(owner).getPair(this.cook.address,this.weth.address);

    this.univ2 = await ethers.getContractAt("IUniswapV2Pair",this.pairAddress,owner);

    this.cook.connect(owner).mint(await owner.getAddress(),'10000000000000000000000');
    this.weth.connect(owner).mint(await owner.getAddress(),'10000000000000000000000');

    const routerFactory = await ethers.getContractFactory(
      UniswapV2Router02ABI,
      UniswapV2Router02Bytecode,
      owner
    );

    this.rou = await routerFactory.deploy(this.uniswap.address,this.weth.address);
    this.router = await this.rou.deployed();

    await this.cook.connect(owner).approve(this.router.address,'10000000000000000000000');
    await this.weth.connect(owner).approve(this.router.address,'10000000000000000000000');

    await this.router.connect(owner).addLiquidity(this.cook.address,this.weth.address,"10000000000000000000000","10000000000000000000000","100","100",await owner.getAddress(),await latest(1000000000));


    const poolFactory = await ethers.getContractFactory(
      "MockPool",
      owner
    );

    poolInstance = (await poolFactory.deploy(cookInstance.address, this.pairAddress, STAKE_LOCKUP_DURATION, REWARD_PER_BLOCK)) as MockPool;
    this.pool = await poolInstance.deployed();

    this.cook.connect(owner).mint(await poolInstance.address,'1000000000000000000000000');
  });

  describe('Init', function () {
    it('has correct initial states', async function () {
      expect(await this.pool.blockNumberE()).to.be.equal(0);
      expect(await this.pool.lastRewardBlock()).to.be.equal(0);
      expect(await this.pool.totalStaked()).to.be.equal(0);
      expect(await this.pool.totalRewarded()).to.be.equal(0);
      expect(await this.pool.totalClaimed()).to.be.equal(0);
      expect(await this.pool.totalVesting()).to.be.equal(0);
      expect(await this.pool.totalPhantom()).to.be.equal(0);
      expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.getStakeLockupDuration()).to.be.equal(STAKE_LOCKUP_DURATION);
      expect(await this.pool.getRewardPerBlock()).to.be.equal(REWARD_PER_BLOCK);
    });
  });

  describe('Stake', function () {
    const initialBlockNumber = 0;

    describe('Without approve', function() {
      beforeEach('set initial block number and userA has 20 univ2', async function () {
        await this.pool.setBlockNumber(initialBlockNumber);
        expect(await this.pool.blockNumberE()).to.be.equal(initialBlockNumber);
        expect(await this.pool.lastRewardBlock()).to.be.equal(initialBlockNumber);

        await this.univ2.connect(owner).transfer(addrUserA, 20);
        expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(20);
      });

      it('should not be able to stake any amount', async function () {
        await expect(this.pool.connect(userA).stake(1)).to.be.reverted;
      });
    });

    describe('With approve', function() {
      beforeEach('set initial block number and userA approves 20 univ2', async function () {
        await this.pool.setBlockNumber(initialBlockNumber);
        expect(await this.pool.blockNumberE()).to.be.equal(initialBlockNumber);
        expect(await this.pool.lastRewardBlock()).to.be.equal(initialBlockNumber);

        await this.univ2.connect(owner).transfer(addrUserA, 20);
        expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(20);
        await this.univ2.connect(userA).approve(this.pool.address, 20);

        await this.univ2.connect(owner).transfer(addrUserB, 20);
        expect(await this.univ2.balanceOf(addrUserB)).to.be.equal(20);
        await this.univ2.connect(userB).approve(this.pool.address, 20);
      });

      it('should not be able to stake zero or negative amount', async function () {
        await expect(this.pool.connect(userA).stake(-10)).to.be.reverted;
        await expect(this.pool.connect(userA).stake(0)).to.be.revertedWith("zero stake amount");
      });

      it('should emit Stake event with correct amount', async function() {
        await expect(this.pool.connect(userA).stake(10))
        .to.emit(this.pool, 'Stake')
        .withArgs(await userA.getAddress(), 10);
      });

      describe('With no lockup', function() {
        const stakeAmount = 10;
        const newBlockNumber = 1;

        beforeEach('set stake lockup duration to 0 and userA stakes some amount', async function () {
          await this.pool.setStakeLockupDuration(0);
          await this.pool.setBlockNumber(newBlockNumber);
          await this.pool.connect(userA).stake(stakeAmount);
        });

        it('should be able to unstake at any time', async function () {
          expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(stakeAmount);
        });

        it('should have the correct states', async function () {
          expect(await this.pool.totalRewarded()).to.be.equal(0);
          expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
          expect(await this.pool.lastRewardBlock()).to.be.equal(newBlockNumber);
          expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(stakeAmount);
          expect(await this.pool.totalStaked()).to.be.equal(stakeAmount);
          expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE*stakeAmount);
          expect(await this.pool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE*stakeAmount);
        });
      });

      describe('With stake lockup', function() {
        const stakeAmount = 10;
        const initialTimestamp = 1598400000;
        const lastRewardBlock = initialBlockNumber;

        beforeEach('userA stakes inital amount', async function () {
          await this.pool.setBlockNumber(initialBlockNumber);
          await this.pool.setBlockTimestamp(initialTimestamp);
          await this.pool.connect(userA).stake(stakeAmount);
        });

        it('should not be able to unstake right after staking', async function () {
          expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
        });

        it('should have the correct states', async function () {
          expect(await this.pool.totalRewarded()).to.be.equal(0);
          expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
          expect(await this.pool.lastRewardBlock()).to.be.equal(lastRewardBlock);
          expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(stakeAmount);
          expect(await this.pool.totalStaked()).to.be.equal(stakeAmount);
          expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE*stakeAmount);
          expect(await this.pool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE*stakeAmount);
        });

        it('should be unlocked after lockup duration', async function () {
          await this.pool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION-1)); //before lockup period
          expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);

          await this.pool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION)); //after lockup period
          expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(stakeAmount);
        });

        it('same user stakes again and should have the correct reward/phantom calculation', async function () {
          const newBlockNumber = 2;
          const newStakeAmount = 5;
          const previousStakeAmount = stakeAmount;
          let totalStakeAmount = stakeAmount + newStakeAmount;
          await this.pool.setBlockNumber(newBlockNumber);
          await this.pool.connect(userA).stake(newStakeAmount);

          let expectedReward = (newBlockNumber-lastRewardBlock)*REWARD_PER_BLOCK;
          expect(await this.pool.totalRewarded()).to.be.equal(expectedReward);
          expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);
          expect(await this.pool.lastRewardBlock()).to.be.equal(newBlockNumber);
          expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(totalStakeAmount);
          expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
          expect(await this.pool.totalStaked()).to.be.equal(totalStakeAmount);
          let expectedNewPhantom = (expectedReward + INITIAL_STAKE_MULTIPLE*previousStakeAmount)*newStakeAmount/previousStakeAmount;
          let oldPhantom = INITIAL_STAKE_MULTIPLE*previousStakeAmount;
          let expectedPhantom = oldPhantom + expectedNewPhantom;
          expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(expectedPhantom);
          expect(await this.pool.totalPhantom()).to.be.equal(expectedPhantom);
        });

        it('different user stakes and each of them should have the correct reward/phantom calculation', async function () {
          const newBlockNumber = 2;
          const newStakeAmount = 5;
          const previousStakeAmount = stakeAmount;
          let totalStakeAmount = stakeAmount + newStakeAmount;
          await this.pool.setBlockNumber(newBlockNumber);
          await this.pool.connect(userB).stake(newStakeAmount);

          let expectedReward = (newBlockNumber-lastRewardBlock)*REWARD_PER_BLOCK;
          expect(await this.pool.totalRewarded()).to.be.equal(expectedReward);
          expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);
          expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(0);
          expect(await this.pool.lastRewardBlock()).to.be.equal(newBlockNumber);
          expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(previousStakeAmount);
          expect(await this.pool.balanceOfStaked(addrUserB)).to.be.equal(newStakeAmount);
          expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
          expect(await this.pool.totalStaked()).to.be.equal(totalStakeAmount);
          let expectedNewPhantom = (expectedReward + INITIAL_STAKE_MULTIPLE*previousStakeAmount)*newStakeAmount/previousStakeAmount;
          let oldPhantom = INITIAL_STAKE_MULTIPLE*previousStakeAmount;
          let expectedPhantom = oldPhantom + expectedNewPhantom;
          expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(oldPhantom);
          expect(await this.pool.balanceOfPhantom(addrUserB)).to.be.equal(expectedNewPhantom);
          expect(await this.pool.totalPhantom()).to.be.equal(expectedPhantom);
        });
      });
    });
  });

  describe('Unstake', function () {
    const initialBlockNumber = 0;
    const initialTimestamp = 1598400000;
    const stakeAmount = 10;

    beforeEach('set initial block number and userA stakes 10 univ2', async function () {
      await this.pool.setBlockNumber(initialBlockNumber);
      await this.pool.setBlockTimestamp(initialTimestamp);

      await this.univ2.connect(owner).transfer(addrUserA, stakeAmount);
      await this.univ2.connect(userA).approve(this.pool.address, stakeAmount);
      await this.pool.connect(userA).stake(stakeAmount);
    });

    describe('during lockup period', function () {
      it('should not be able to unstake', async function() {
        await this.pool.setBlockTimestamp(initialTimestamp+(86400*STAKE_LOCKUP_DURATION-1)); //during lockup period
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
        await expect(this.pool.connect(userA).unstake(stakeAmount)).to.be.revertedWith("insufficient unstakable balance");
      });
    });

    describe('after lockup period', function () {
      beforeEach('advance after lockup', async function () {
        await this.pool.setBlockTimestamp(initialTimestamp+(86400*STAKE_LOCKUP_DURATION)); //after lockup period
      });

      it('should be able to unstake', async function() {
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(stakeAmount);
        await expect(this.pool.connect(userA).unstake(stakeAmount)).to.not.be.reverted;
      });

      it('should not be able to unstake zero or negative amount', async function () {
        await expect(this.pool.connect(userA).unstake(-10)).to.be.reverted;
        await expect(this.pool.connect(userA).unstake(0)).to.be.revertedWith("zero unstake amount");
      });

      it('should emit the Unstake event with correct amount', async function () {
        await expect(this.pool.connect(userA).unstake(stakeAmount))
        .to.emit(this.pool, 'Unstake')
        .withArgs(await userA.getAddress(), stakeAmount);
      });

      it('unstake half of the staked amount and should have the correct states', async function () {
        const newBlockNumber = 10;

        await this.pool.setBlockNumber(newBlockNumber);
        await this.pool.connect(userA).unstake(stakeAmount/2);

        expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(stakeAmount/2);
        expect(await this.pool.totalRewarded()).to.be.equal(REWARD_PER_BLOCK*(newBlockNumber-initialBlockNumber)/2);
        expect(await this.pool.lastRewardBlock()).to.be.equal(newBlockNumber);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.equal(REWARD_PER_BLOCK*(newBlockNumber-initialBlockNumber)/2);
        expect(await this.pool.totalVesting()).to.equal(REWARD_PER_BLOCK*(newBlockNumber-initialBlockNumber)/2);
        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(stakeAmount/2);
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(stakeAmount/2);
        expect(await this.pool.totalStaked()).to.be.equal(stakeAmount/2);
        expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE*(stakeAmount/2));
        expect(await this.pool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE*(stakeAmount/2));
      });

      it('stake more but can only unstake the initial unlocked amount', async function() {
        const newStakeAmount = 20;
        const previousStakeAmount = stakeAmount;
        let totalStakeAmount = stakeAmount + newStakeAmount;
        await this.univ2.connect(owner).transfer(addrUserA, newStakeAmount);
        await this.univ2.connect(userA).approve(this.pool.address, newStakeAmount);
        await this.pool.connect(userA).stake(newStakeAmount);

        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(previousStakeAmount);
        await expect(this.pool.connect(userA).unstake(totalStakeAmount)).to.be.revertedWith("insufficient unstakable balance");
      });
    });
  });

  describe('Harvest', function () {
    const initialBlockNumber = 0;
    const initialTimestamp = 1598400000;
    const stakeAmount = 10;

    beforeEach('set initial block number and userA stakes 10 univ2', async function() {
      await this.pool.setBlockNumber(initialBlockNumber);
      await this.univ2.connect(owner).transfer(addrUserA, 20);
      await this.univ2.connect(userA).approve(this.pool.address, 20);

      // user A stakes 10 at block number 0
      await this.pool.connect(userA).stake(stakeAmount);
    });

    describe('With no reward', async function() {
      it('harvest should be reverted when total reward is 0' , async function() {
        expect(await this.pool.totalRewarded()).to.be.equal(0);
        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
        await expect(this.pool.connect(userA).harvest(5)).to.be.revertedWith("insufficient total rewarded");
      });

      it('harvest should be reverted when no reward for given user' , async function() {
        const newBlockNumber = 10;
        // user B stakes 20 at block number 10
        await this.univ2.connect(owner).transfer(addrUserB, 20);
        await this.univ2.connect(userB).approve(this.pool.address, 20);
        await this.pool.setBlockNumber(newBlockNumber);
        await this.pool.connect(userB).stake(20);

        let expectedReward = (newBlockNumber - initialBlockNumber)*REWARD_PER_BLOCK;
        expect(await this.pool.totalRewarded()).to.be.equal(expectedReward);
        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);
        expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(0);

        await expect(this.pool.connect(userB).harvest(5)).to.be.revertedWith("insufficient rewarded balance");
      });
    });

    describe('With reward', async function() {
      const newBlockNumber = 60;
      const newStakeAmount = 5;

      beforeEach('userA stakes 5 at block number 10', async function() {
        await this.pool.setBlockNumber(newBlockNumber);
        await this.pool.connect(userA).stake(newStakeAmount);
      });

      it('should not be able to harvest zero or negative amount', async function () {
        await expect(this.pool.connect(userA).harvest(-10)).to.be.reverted;
        await expect(this.pool.connect(userA).harvest(0)).to.be.revertedWith("zero harvest amount");
      });

      it('should be able to harvest and the user state and total state should be updated' , async function() {
        let expectedReward = (newBlockNumber-initialBlockNumber)*REWARD_PER_BLOCK;
        let totalStakeAmount = stakeAmount + newStakeAmount;
        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);

        await this.pool.setBlockTimestamp(initialTimestamp);
        let harvestAmount = expectedReward;
        await this.pool.connect(userA).harvest(harvestAmount);

        expect(await this.pool.totalRewarded()).to.be.equal(0);
        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
        expect(await this.pool.lastRewardBlock()).to.be.equal(newBlockNumber);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(harvestAmount);
        expect(await this.pool.totalVesting()).to.be.equal(harvestAmount);
        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(totalStakeAmount);
        expect(await this.pool.totalStaked()).to.be.equal(totalStakeAmount);
        let expectedPhantom = (newBlockNumber - initialBlockNumber) * REWARD_PER_BLOCK / 2 + harvestAmount + INITIAL_STAKE_MULTIPLE*15;
        expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(expectedPhantom);
        expect(await this.pool.totalPhantom()).to.be.equal(expectedPhantom);

        await this.pool.setBlockTimestamp(1599696000); // 1598400000+(86400*15) after 15 days
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);

        await this.pool.setBlockTimestamp(1600992000); // 1598400000+(86400*30) after 1 months
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(harvestAmount/6);

        await this.pool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) after 3 months
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(harvestAmount/2);

        await this.pool.setBlockTimestamp(1613952000); // 1598400000+(86400*180) after 6 months
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(harvestAmount);
      });

      it('should emit Harvest event with correct amount', async function() {
        await expect(this.pool.connect(userA).harvest(5))
          .to.emit(this.pool, 'Harvest')
          .withArgs(await userA.getAddress(), 5);
      });
    });
  });

  describe('Claim', function () {
    const initialBlockNumber = 0;
    const initialTimestamp = 1598400000;
    const initialHarvestAmount = 60;

    beforeEach('userA stakes to get rewards and harvests half rewards', async function() {
      await this.pool.setBlockNumber(initialBlockNumber);
      await this.univ2.connect(owner).transfer(addrUserA, 20);
      await this.univ2.connect(userA).approve(this.pool.address, 20);

      // user A stakes 10 at block number 1
      let newBlockNumber = 1;
      await this.pool.setBlockNumber(newBlockNumber);
      await this.pool.connect(userA).stake(10);
      let lastRewardBlock = newBlockNumber;

      // user A stakes 5 at block number 61
      newBlockNumber = 61;
      await this.pool.setBlockNumber(newBlockNumber);
      await this.pool.connect(userA).stake(5);
      let expectedReward = (newBlockNumber-lastRewardBlock)*REWARD_PER_BLOCK;
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);

      await this.pool.setBlockTimestamp(initialTimestamp);
      await this.pool.connect(userA).harvest(initialHarvestAmount);

      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward-initialHarvestAmount);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(initialHarvestAmount);
    });

    describe('during vesting period', function() {
      beforeEach('advance after half of the vesting schedule', async function () {
        await this.pool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) => after 3 months
      });

      it('should be able to claim the the vested amount', async function () {
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount/2);
        await expect(this.pool.connect(userA).claim(initialHarvestAmount/2)).to.not.be.reverted;
      });

      it('should get reverted if tries to claim the amount more than the claimable', async function() {
        await expect(this.pool.connect(userA).claim(initialHarvestAmount/2 + 5)).to.be.revertedWith("insufficient claimable balance");
      });

      it('the balance of claimable for userA should be updated correctly and userA can claim part of the claimable' , async function() {
        let claimable = initialHarvestAmount/2;
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(claimable);

        let claimed = claimable/2;
        await this.pool.connect(userA).claim(claimed);
        let remainingClaimable = claimable-claimed;
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(remainingClaimable);

        let remainingReward = await this.pool.balanceOfRewarded(addrUserA);
        let harvestAmount = remainingReward/1;
        await this.pool.connect(userA).harvest(harvestAmount);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(remainingClaimable);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(initialHarvestAmount+harvestAmount);

        await this.pool.setBlockTimestamp(1613952000); // 1598400000+(86400*180) => after 6 months for the inital harvest and after 3 months for the second harvest
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount+(harvestAmount/2)-claimed);
      });
    });

    describe('after full vesting', function () {
      beforeEach('advance after full vesting', async function () {
        await this.pool.setBlockTimestamp(1613952000); // 1598400000+(86400*180) => after 6 months
      });

      it('should be able to claim the full vesting amount', async function () {
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount);
        await expect(this.pool.connect(userA).claim(initialHarvestAmount)).to.not.be.reverted;
      });

      it('should not be able to claim zero or negative amount', async function () {
        await expect(this.pool.connect(userA).claim(-10)).to.be.reverted;
        await expect(this.pool.connect(userA).claim(0)).to.be.revertedWith("zero claim amount");
      });

      it('Claim event should be emitted correctly', async function() {
        await expect(this.pool.connect(userA).claim(initialHarvestAmount))
          .to.emit(this.pool, 'Claim')
          .withArgs(await userA.getAddress(), initialHarvestAmount);
      });
    });
  });

  describe('Zap', function () {
    const initialBlockNumber = 0;
    const initialTimestamp = 1598400000;
    const initialHarvestAmount = 60;

    beforeEach('userA stakes to get rewards and harvests half rewards', async function() {
      await this.pool.setBlockNumber(initialBlockNumber);
      await this.univ2.connect(owner).transfer(addrUserA, 20);
      await this.univ2.connect(userA).approve(this.pool.address, 20);

      await this.weth.mint(addrUserA, '1000000000000000000000');
      await this.weth.connect(userA).approve(this.pool.address,'1000000000000000000000');

      // user A stakes 10 at block number 1
      let newBlockNumber = 1;
      await this.pool.setBlockNumber(newBlockNumber);
      await this.pool.connect(userA).stake(10);
      let lastRewardBlock = newBlockNumber;

      // user A stakes 5 at block number 61
      newBlockNumber = 61;
      await this.pool.setBlockNumber(newBlockNumber);
      await this.pool.connect(userA).stake(5);
      let expectedReward = (newBlockNumber-lastRewardBlock)*REWARD_PER_BLOCK;
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward);

      await this.pool.setBlockTimestamp(initialTimestamp);
      await this.pool.connect(userA).harvest(initialHarvestAmount);

      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(expectedReward-initialHarvestAmount);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(initialHarvestAmount);
    });

    describe('during vesting period', function() {
      beforeEach('advance after half of the vesting schedule', async function () {
        await this.pool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) => after 3 months
      });

      it('should be able to zap the the vested amount', async function () {
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(initialHarvestAmount/2);
        await expect(this.pool.connect(userA).zap(initialHarvestAmount/2)).to.not.be.reverted;
      });

      it('should not be able to zap zero or negative amount', async function () {
        await expect(this.pool.connect(userA).zap(-10)).to.be.reverted;
        await expect(this.pool.connect(userA).zap(0)).to.be.revertedWith("zero zap amount");
      });

      it('should get reverted if tries to zap the amount more than the claimable', async function() {
        await expect(this.pool.connect(userA).zap(initialHarvestAmount/2 + 5)).to.be.revertedWith("insufficient claimable balance");
      });

      it('the balance of claimable for userA should be updated correctly and userA can zap part of the claimable' , async function() {
        let previousStakeAmount = await this.pool.balanceOfStaked(addrUserA);
        let claimable = initialHarvestAmount/2;
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(claimable);

        let zapCookAmount = claimable/2;
        await this.pool.connect(userA).zap(zapCookAmount);
        let remainingClaimable = claimable-zapCookAmount;
        let expectedNewUniv2 = zapCookAmount;
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(remainingClaimable);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(zapCookAmount);
        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(previousStakeAmount.add(expectedNewUniv2));
      });

      it('Zap event should be emitted correctly', async function() {
        let zapCookAmount = initialHarvestAmount/2;
        let expectedWethAmount = zapCookAmount;
        let expectedUniv2Amount = zapCookAmount;
        await expect(this.pool.connect(userA).zap(zapCookAmount))
          .to.emit(this.pool, 'Zap')
          .withArgs(await userA.getAddress(), zapCookAmount, expectedWethAmount, expectedUniv2Amount);
      });
    });
  });
});
