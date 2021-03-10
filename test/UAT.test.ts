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

const getAddress = async (signer: Signer) => {
  return await signer.getAddress();
}

async function latest(addtime: number = 0) {
  const block = await ethers.provider.send("eth_getBlockByNumber", ['latest', false]);
  return ethers.BigNumber.from(block.timestamp).add(addtime);
}

const REWARD_PER_BLOCK = 1000;
const STAKE_LOCKUP_DURATION = 30;
const VESTING_DURATION = 180;

describe("Pool", function () {
  let cookInstance: MockCOOK;
  let poolInstance: MockPool;
  let wethInstance: TestnetWETH;

  let owner: Signer;
  let userA: Signer;
  let userB: Signer;
  let userC: Signer;
  let userD: Signer;

  let addrOwner: Promise<string>;
  let addrUserA: Promise<string>;
  let addrUserB: Promise<string>;
  let addrUserC: Promise<string>;
  let addrUserD: Promise<string>;

  beforeEach(async function () {
    [owner, userA, userB, userC, userD] = await ethers.getSigners();
    [addrOwner, addrUserA, addrUserB, addrUserC, addrUserD] = [owner, userA, userB, userC, userD].map(signer => {
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

    await this.uniswap.connect(owner).createPair(this.cook.address, this.weth.address);

    this.pairAddress = await this.uniswap.connect(owner).getPair(this.cook.address, this.weth.address);

    this.univ2 = await ethers.getContractAt("IUniswapV2Pair", this.pairAddress, owner);

    this.cook.connect(owner).mint(await owner.getAddress(), '10000000000000000000000');
    this.weth.connect(owner).mint(await owner.getAddress(), '10000000000000000000000');

    const routerFactory = await ethers.getContractFactory(
      UniswapV2Router02ABI,
      UniswapV2Router02Bytecode,
      owner
    );

    this.rou = await routerFactory.deploy(this.uniswap.address, this.weth.address);
    this.router = await this.rou.deployed();

    await this.cook.connect(owner).approve(this.router.address, '10000000000000000000000');
    await this.weth.connect(owner).approve(this.router.address, '10000000000000000000000');

    await this.router.connect(owner).addLiquidity(this.cook.address, this.weth.address, "10000000000000000000000", "10000000000000000000000", "100", "100", await owner.getAddress(), await latest(1000000000));


    const poolFactory = await ethers.getContractFactory(
      "MockPool",
      owner
    );

    poolInstance = (await poolFactory.deploy(cookInstance.address, this.pairAddress, STAKE_LOCKUP_DURATION, VESTING_DURATION, REWARD_PER_BLOCK)) as MockPool;
    this.pool = await poolInstance.deployed();

    this.cook.connect(owner).mint(await poolInstance.address, '1000000000000000000000000');
  });

  describe('UAT Test Cases [Pool]', function () {
    const initialTimestamp = 1598400000;

    beforeEach('set block number to 0', async function () {
      console.log("block number ", 0);
      await this.pool.setBlockNumber(0);
      console.log("block timestamp ", initialTimestamp);
      await this.pool.setBlockTimestamp(initialTimestamp);

      expect(await this.pool.blockNumberE()).to.be.equal(0);
      expect(await this.pool.lastRewardBlock()).to.be.equal(0);
    });

    describe('with no lockup', function () {
      beforeEach('set stake lockup duration to 0 and userA stakes some amount', async function () {
        await this.pool.setStakeLockupDuration(0);
      });

      it('staked and unstakable balances should be correct', async function () {
        console.log("A stakes 10");
        await this.univ2.connect(owner).transfer(addrUserA, 10);
        await this.univ2.connect(userA).approve(this.pool.address, 10);
        await this.pool.connect(userA).stake(10);

        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(10);
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(10);
        expect(await this.pool.totalStaked()).to.be.equal(10);

        console.log("block moves from 0 to 1");
        await this.pool.setBlockNumber(1);
        console.log("A stakes 15");
        await this.univ2.connect(owner).transfer(addrUserA, 15);
        await this.univ2.connect(userA).approve(this.pool.address, 15);
        await this.pool.connect(userA).stake(15);

        expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(25);
        expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(25);
        expect(await this.pool.totalStaked()).to.be.equal(25);

        console.log("block moves from 1 to 2");
        await this.pool.setBlockNumber(2);
        console.log("B stakes 5");
        await this.univ2.connect(owner).transfer(addrUserB, 5);
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

      it('rewarded balance should be correct', async function () {
        console.log("A stakes 10");
        await this.pool.setBlockNumber(0);
        await this.univ2.connect(owner).transfer(addrUserA, 10);
        await this.univ2.connect(userA).approve(this.pool.address, 10);
        await this.pool.connect(userA).stake(10);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
        expect(await this.pool.totalRewarded()).to.be.equal(0);

        console.log("block moves from 0 to 2");
        await this.pool.setBlockNumber(2);
        console.log("A stakes 15");
        await this.univ2.connect(owner).transfer(addrUserA, 15);
        await this.univ2.connect(userA).approve(this.pool.address, 15);
        await this.pool.connect(userA).stake(15);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(2 * REWARD_PER_BLOCK);
        expect(await this.pool.totalRewarded()).to.be.equal(2 * REWARD_PER_BLOCK);

        console.log("block moves from 2 to 5");
        await this.pool.setBlockNumber(5);
        console.log("B stakes 5");
        await this.univ2.connect(owner).transfer(addrUserB, 5);
        await this.univ2.connect(userB).approve(this.pool.address, 5);
        await this.pool.connect(userB).stake(5);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(5 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(0);
        expect(await this.pool.totalRewarded()).to.be.equal(5 * REWARD_PER_BLOCK);

        console.log("block moves from 5 to 35");
        await this.pool.setBlockNumber(35);
        console.log("A unstakes 20");
        await this.pool.connect(userA).unstake(20);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(6 * REWARD_PER_BLOCK); //30-30*(20/25)
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(24 * REWARD_PER_BLOCK); //30*(20/25)
        expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(5 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfVesting(addrUserB)).to.be.equal(0);
        expect(await this.pool.totalRewarded()).to.be.equal(11 * REWARD_PER_BLOCK);
        expect(await this.pool.totalVesting()).to.be.equal(24 * REWARD_PER_BLOCK);

        console.log("block moves from 35 to 37");
        await this.pool.setBlockNumber(37);
        console.log("B unstake 5");
        await this.pool.connect(userB).unstake(5);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(7 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(24 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(0);
        expect(await this.pool.balanceOfVesting(addrUserB)).to.be.equal(6 * REWARD_PER_BLOCK);
        expect(await this.pool.totalRewarded()).to.be.equal(7 * REWARD_PER_BLOCK);
        expect(await this.pool.totalVesting()).to.be.equal(30 * REWARD_PER_BLOCK);
      });

      it('claimable and claimed balance should be correct', async function () {
        console.log("A stakes 10");
        await this.univ2.connect(owner).transfer(addrUserA, 25);
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

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(12 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("A harvests half of the reward");
        await this.pool.connect(userA).harvest(6 * REWARD_PER_BLOCK);

        expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(6 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("Advance less than month");
        await this.pool.setBlockTimestamp(initialTimestamp + (86400 * 10));
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("Advance 1 month");
        await this.pool.setBlockTimestamp(initialTimestamp + (86400 * 30));
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(1 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("Advance 3 months");
        await this.pool.setBlockTimestamp(initialTimestamp + (86400 * 90));
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(3 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(0);

        console.log("A claims 2/3 of the reward");
        await this.pool.connect(userA).claim(2 * REWARD_PER_BLOCK);

        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(1 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(2 * REWARD_PER_BLOCK);

        console.log("Advance 6 months");
        await this.pool.setBlockTimestamp(initialTimestamp + (86400 * 180));
        expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(4 * REWARD_PER_BLOCK);
        expect(await this.pool.balanceOfClaimed(addrUserA)).to.be.equal(2 * REWARD_PER_BLOCK);
      });
    });
  });
});
