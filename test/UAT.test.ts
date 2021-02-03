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
const REWARD_PER_BLOCK = 1000;
const STAKE_LOCKUP_DURATION = 30;

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
    await this.pool.setRewardPerBlock(REWARD_PER_BLOCK);
    await this.pool.setStakeLockupDuration(STAKE_LOCKUP_DURATION);
  });

  describe('UAT Test Cases [Pool]', function () {
    const initialTimestamp = 1598400000;

    beforeEach('set block number to 0', async function() {
      console.log("block number ", 0);
      await this.pool.setBlockNumber(0);
      console.log("block timestamp ", initialTimestamp);
      await this.pool.setBlockTimestamp(initialTimestamp);

      expect(await this.pool.blockNumberE()).to.be.equal(0);
      expect(await this.pool.lastRewardBlock()).to.be.equal(0);
    });

    describe('with no lockup', function() {
      beforeEach('set stake lockup duration to 0 and userA stakes some amount', async function () {
        await this.pool.setStakeLockupDuration(0);
      });

      it('staked and unstakable balances should be correct', async function() {
        console.log("A stakes 10");
        await this.univ2.faucet(addrUserA, 10);
        await this.univ2.connect(userA).approve(this.pool.address, 10);
        await this.pool.connect(userA).stake(10);

        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(10);
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(10);
        expect(await this.pool.totalStaked()).to.be.equal(10);

        console.log("block moves from 0 to 1");
        await this.pool.setBlockNumber(1);
        console.log("A stakes 15");
        await this.univ2.faucet(addrUserA, 15);
        await this.univ2.connect(userA).approve(this.pool.address, 15);
        await this.pool.connect(userA).stake(15);

        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(25);
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(25);
        expect(await this.pool.totalStaked()).to.be.equal(25);

        console.log("block moves from 1 to 2");
        await this.pool.setBlockNumber(2);
        console.log("B stakes 5");
        await this.univ2.faucet(addrUserB, 5);
        await this.univ2.connect(userB).approve(this.pool.address, 5);
        await this.pool.connect(userB).stake(5);

        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(25);
        expect(await this.pool.balanceOfStaked(addrUserB)).to.be.equal(5);
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(25);
        expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(5);
        expect(await this.pool.totalStaked()).to.be.equal(30);

        console.log("block moves from 2 to 3");
        await this.pool.setBlockNumber(3);
        console.log("A unstakes 20");
        await this.pool.connect(userA).unstake(20);

        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(5);
        expect(await this.pool.balanceOfStaked(addrUserB)).to.be.equal(5);
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(5);
        expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(5);
        expect(await this.pool.totalStaked()).to.be.equal(10);
      });

      it('rewarded balance should be correct', async function() {
        console.log("A stakes 10");
        await this.pool.setBlockNumber(0);
        await this.univ2.faucet(addrUserA, 10);
        await this.univ2.connect(userA).approve(this.pool.address, 10);
        await this.pool.connect(userA).stake(10);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
        expect(await this.pool.totalRewarded()).to.be.equal(0);

        console.log("block moves from 0 to 2");
        await this.pool.setBlockNumber(2);
        console.log("A stakes 15");
        await this.univ2.faucet(addrUserA, 15);
        await this.univ2.connect(userA).approve(this.pool.address, 15);
        await this.pool.connect(userA).stake(15);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(2*REWARD_PER_BLOCK);
        expect(await this.pool.totalRewarded()).to.be.equal(2*REWARD_PER_BLOCK);

        console.log("block moves from 2 to 5");
        await this.pool.setBlockNumber(5);
        console.log("B stakes 5");
        await this.univ2.faucet(addrUserB, 5);
        await this.univ2.connect(userB).approve(this.pool.address, 5);
        await this.pool.connect(userB).stake(5);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(5*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(0);
        expect(await this.pool.totalRewarded()).to.be.equal(5*REWARD_PER_BLOCK);

        console.log("block moves from 5 to 35");
        await this.pool.setBlockNumber(35);
        console.log("A unstakes 20");
        await this.pool.connect(userA).unstake(20);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(6*REWARD_PER_BLOCK); //30-30*(20/25)
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(24*REWARD_PER_BLOCK); //30*(20/25)
        expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(5*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfVesting(addrUserB)).to.be.equal(0);
        expect(await this.pool.totalRewarded()).to.be.equal(11*REWARD_PER_BLOCK);
        expect(await this.pool.totalVesting()).to.be.equal(24*REWARD_PER_BLOCK);

        console.log("block moves from 35 to 37");
        await this.pool.setBlockNumber(37);
        console.log("B unstake 5");
        await this.pool.connect(userB).unstake(5);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(7*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(24*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(0);
        expect(await this.pool.balanceOfVesting(addrUserB)).to.be.equal(6*REWARD_PER_BLOCK);
        expect(await this.pool.totalRewarded()).to.be.equal(7*REWARD_PER_BLOCK);
        expect(await this.pool.totalVesting()).to.be.equal(30*REWARD_PER_BLOCK);
      });

      it('claimable and claimed balance should be correct', async function() {
        console.log("A stakes 10");
        await this.univ2.faucet(addrUserA, 25);
        await this.univ2.connect(userA).approve(this.pool.address, 25);
        await this.pool.connect(userA).stake(10);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("block moves from 0 to 12");
        await this.pool.setBlockNumber(12);
        console.log("A stakes 15");
        await this.pool.connect(userA).stake(15);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(12*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("A harvests half of the reward");
        await this.pool.connect(userA).harvest(6*REWARD_PER_BLOCK);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(6*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("Advance less than month");
        await this.pool.setBlockTimestamp(initialTimestamp + (86400 * 10));
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("Advance 1 month");
        await this.pool.setBlockTimestamp(initialTimestamp + (86400 * 30));
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(1*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("Advance 3 months");
        await this.pool.setBlockTimestamp(initialTimestamp + (86400 * 90));
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(3*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("A claims 2/3 of the reward");
        await this.pool.connect(userA).claim(2*REWARD_PER_BLOCK);

        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(1*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(2*REWARD_PER_BLOCK);

        console.log("Advance 6 months");
        await this.pool.setBlockTimestamp(initialTimestamp + (86400 * 180));
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(4*REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(2*REWARD_PER_BLOCK);
      });
    });
  });
});
