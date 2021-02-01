import { ethers } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";

import { MockCOOK } from "../typechain/MockCOOK";
import { MockPool } from "../typechain/MockPool";
import { MockUniswapV2PairLiquidity } from "../typechain/MockUniswapV2PairLiquidity";

chai.use(solidity);

const { expect } = chai;

const getAddress = async(signer:Signer) => {
  return await signer.getAddress();
}

const INITIAL_STAKE_MULTIPLE = 1e6;

describe("Pool", function () {
  let cookInstance : MockCOOK;
  let poolInstance : MockPool;
  let univ2Insatnce : MockUniswapV2PairLiquidity;

  let owner : Signer;
  let userA : Signer;
  let userB : Signer;
  let userC : Signer;
  let userD : Signer;

  let addrOwner : Promise<string>;
  let addrUserA : Promise<string>;
  let addrUserB : Promise<string>;
  let addrUserC : Promise<string>;
  let addrUserD : Promise<string>;

  beforeEach(async function () {
    [owner, userA, userB, userC, userD] = await ethers.getSigners();
    [ addrOwner, addrUserA, addrUserB, addrUserC, addrUserD ] = [owner, userA, userB, userC, userD ].map(signer => {
      return getAddress(signer)
    })

    const cookFactory = await ethers.getContractFactory(
      "MockCOOK",
      owner
    );
    cookInstance = (await cookFactory.deploy("1000000")) as MockCOOK;
    await cookInstance.deployed();

    const univ2Factory = await ethers.getContractFactory(
      "MockUniswapV2PairLiquidity",
      owner
    );

    univ2Insatnce = (await univ2Factory.deploy()) as MockUniswapV2PairLiquidity;
    this.univ2 = await univ2Insatnce.deployed();

    const poolFactory = await ethers.getContractFactory(
      "MockPool",
      owner
    );

    poolInstance = (await poolFactory.deploy(cookInstance.address, univ2Insatnce.address)) as MockPool;
    this.pool = await poolInstance.deployed();
  });

  describe('stake', function () {
    beforeEach('set initial block number to be 0 and userA approves 20 univ2', async function () {
      await this.pool.setBlockNumber(0);
      expect(await this.pool.blockNumberE()).to.be.equal(0);
      expect(await this.pool.lastRewardBlock()).to.be.equal(0);

      await this.univ2.faucet(addrUserA, 20);
      expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(20);
      await this.univ2.connect(userA).approve(this.pool.address, 20);
    });

    it('userA stakes 10 univ2 at block number 1 and stakes 10 univ2 at block number 2 and the user state and total state should be updated', async function () {
      const initialTimestamp = 1598400000;
      const STAKE_LOCKUP_DURATION = await this.pool.stakeLockupDuration();
      
      // user A stakes 10 at block number 1
      await this.pool.setBlockNumber(1);
      await this.pool.setBlockTimestamp(initialTimestamp);
      await this.pool.connect(userA).stake(10);

      expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(10);
      expect(await this.pool.totalRewarded()).to.be.equal(0);
      expect(await this.pool.lastRewardBlock()).to.be.equal(1);
      expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(10);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.pool.totalStaked()).to.be.equal(10);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE*10);
      expect(await this.pool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE*10);

      // user A stakes 10 at block number 2
      await this.pool.setBlockNumber(2);
      await this.pool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION-1)); //before lockup period
      await this.pool.connect(userA).stake(10);

      expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(0);
      expect(await this.pool.totalRewarded()).to.be.equal(1);
      expect(await this.pool.lastRewardBlock()).to.be.equal(2);
      expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(20);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.pool.totalStaked()).to.be.equal(20);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(1 + INITIAL_STAKE_MULTIPLE*20);
      expect(await this.pool.totalPhantom()).to.be.equal(1 + INITIAL_STAKE_MULTIPLE*20);

      await this.pool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION)); //after lockup period
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(10);
    });

    it('userA stakes 10 univ2 and the Stake event should be emitted correctly', async function() {
      await expect(this.pool.connect(userA).stake(10))
      .to.emit(this.pool, 'Stake')
      .withArgs(await userA.getAddress(), 10);
    });
  });

  describe('unstake', function () {
    const initialTimestamp = 1598400000;

    beforeEach('set initial block number to be 0 and userA stakes 10 univ2 at block number 1', async function () {
      await this.pool.setBlockNumber(0);
      await this.univ2.faucet(addrUserA, 20);
      await this.univ2.connect(userA).approve(this.pool.address, 20);

      await this.pool.setBlockNumber(1);
      await this.pool.setBlockTimestamp(initialTimestamp);
      await this.pool.connect(userA).stake(10);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
    });

    it('userA unstakes 5 univ2 after lockup period and the user state and total state should be updated', async function () {
      const STAKE_LOCKUP_DURATION = await this.pool.stakeLockupDuration();

      await this.pool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION)); //after lockup period
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(10);

      // user A unstakes 5 at block number 11
      await this.pool.setBlockNumber(11);
      await this.pool.connect(userA).unstake(5);

      expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(15);
      expect(await this.pool.totalRewarded()).to.be.equal(5);
      expect(await this.pool.lastRewardBlock()).to.be.equal(11);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(5);
      expect(await this.pool.totalVesting()).to.be.equal(5);
      expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(5);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(5);
      expect(await this.pool.totalStaked()).to.be.equal(5);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE*5);
      expect(await this.pool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE*5);
    });

    it('userA tries to unstake 20 univ2 and at block number 11 and it gets reverted', async function() {
      await expect(this.pool.connect(userA).unstake(20)).to.be.revertedWith("insufficient unstakable balance");
    });

    it('userA unstakes 10 univ2 and the Stake event should be emitted correctly', async function() {
      const STAKE_LOCKUP_DURATION = await this.pool.stakeLockupDuration();

      await this.pool.setBlockTimestamp(initialTimestamp + (86400 * STAKE_LOCKUP_DURATION)); //after lockup period
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(10);

      await expect(this.pool.connect(userA).unstake(10))
      .to.emit(this.pool, 'Unstake')
      .withArgs(await userA.getAddress(), 10);
    });
  });

  describe('harvest', function () {
    beforeEach('set initial block number to be 0 and userA stakes 10 univ2 at block number 1', async function() {
      await this.pool.setBlockNumber(0);
      await this.univ2.faucet(addrUserA, 20);
      await this.univ2.connect(userA).approve(this.pool.address, 20);

      // user A stakes 10 at block number 1
      await this.pool.setBlockNumber(1);
      await this.pool.connect(userA).stake(10);
    });

    it('userA tries to harvests 5 rewards at block number 2 and it should be reverted because no reward to be harvested' , async function() {
      await expect(this.pool.connect(userA).harvest(5)).to.be.revertedWith("insufficient total rewarded");
    });

    it('userB stakes 20 at block number 11 and tries to harvests 5 rewards at block number 2 and it should be reverted because no reward to be harvested for userB' , async function() {
      // user B stakes 20 at block number 11
      await this.univ2.faucet(addrUserB, 20);
      await this.univ2.connect(userB).approve(this.pool.address, 20);
      await this.pool.setBlockNumber(11);
      await this.pool.connect(userB).stake(20);
      await expect(this.pool.connect(userB).harvest(5)).to.be.revertedWith("insufficient rewarded balance");
    });

    it('userA stakes 5 at block number 11 and harvests 10 rewards and the user state and total state should be updated' , async function() {
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE*10);

      // user A stakes 5 at block number 61
      await this.pool.setBlockNumber(61);
      await this.pool.connect(userA).stake(5);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(30 + INITIAL_STAKE_MULTIPLE*15);
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(60);

      await this.pool.setBlockTimestamp(1598400000);
      await this.pool.connect(userA).harvest(60);

      expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(5);
      expect(await this.pool.totalRewarded()).to.be.equal(0);
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
      expect(await this.pool.lastRewardBlock()).to.be.equal(61);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(60);
      expect(await this.pool.totalVesting()).to.be.equal(60);
      expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(15);
      expect(await this.pool.totalStaked()).to.be.equal(15);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(90 + INITIAL_STAKE_MULTIPLE*15);
      expect(await this.pool.totalPhantom()).to.be.equal(90 + INITIAL_STAKE_MULTIPLE*15);

      await this.pool.setBlockTimestamp(1599696000); // 1598400000+(86400*15) after 15 days
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);

      await this.pool.setBlockTimestamp(1600992000); // 1598400000+(86400*30) after 1 months
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(10);

      await this.pool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) after 3 months
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(30);

      await this.pool.setBlockTimestamp(1613952000); // 1598400000+(86400*180) after 6 months
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(60);
    });

    it('userA harvests 10 and the Harvest event should be emitted correctly', async function() {
      await this.pool.setBlockNumber(11);
      await this.pool.connect(userA).stake(5);
      await expect(this.pool.connect(userA).harvest(5))
        .to.emit(this.pool, 'Harvest')
        .withArgs(await userA.getAddress(), 5);
    });
  });

  describe('claim', function () {
    beforeEach('userA stakes to get total of 60 rewards and harvests 40 rewards', async function() {
      await this.pool.setBlockNumber(0);
      await this.univ2.faucet(addrUserA, 20);
      await this.univ2.connect(userA).approve(this.pool.address, 20);

      // user A stakes 10 at block number 1
      await this.pool.setBlockNumber(1);
      await this.pool.connect(userA).stake(10);

      // user A stakes 5 at block number 61
      await this.pool.setBlockNumber(61);
      await this.pool.connect(userA).stake(5);
      expect(await this.pool.totalRewarded()).to.be.equal(60);

      await this.pool.setBlockTimestamp(1598400000);
      await this.pool.connect(userA).harvest(40);

      expect(await this.pool.totalRewarded()).to.be.equal(20);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(40);
    });

    it('userA tries to claim the amount more than the claimable and it should get reverted', async function() {
      await this.pool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) => after 3 months
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(20);

      await expect(this.pool.connect(userA).claim(25)).to.be.revertedWith("insufficient claimable balance");
    });

    it('userA claims rewards and the Claim event should be emitted correctly', async function() {
      await this.pool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) => after 3 months
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(20);

      await expect(this.pool.connect(userA).claim(5))
        .to.emit(this.pool, 'Claim')
        .withArgs(await userA.getAddress(), 5);
    });

    it('the balance of claimable for userA should be updated correctly and userA can claim part of the claimable' , async function() {
      await this.pool.setBlockTimestamp(1606176000); // 1598400000+(86400*90) => after 3 months
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(20);

      await this.pool.connect(userA).claim(5);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(15);

      await this.pool.connect(userA).harvest(20);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(15);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(60);

      await this.pool.setBlockTimestamp(1613952000); // 1598400000+(86400*180) => after 6 months for the first 40 and after 3 months for the remaining 20
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(45); //40 + 10 - 5
    });
  });
});
