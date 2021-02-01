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
  });

  describe('UAT Test Cases [Pool]', function () {
    const initialTimestamp = 1598400000;

    beforeEach('set block number to 0', async function() {
      console.log("block number ", 0);
      await this.pool.setBlockNumber(0);
      console.log("block timestamp ", initialTimestamp);
      await this.pool.setBlockTimestamp(initialTimestamp);
    });

    it('block number should be 0', async function () {
      expect(await this.pool.blockNumberE()).to.be.equal(0);
    });

    it('last reward block should be 0', async function () {
      expect(await this.pool.lastRewardBlock()).to.be.equal(0);
    });

    it('long story', async function() {
      console.log("A stakes 10");
      await this.univ2.faucet(addrUserA, 10);
      await this.univ2.connect(userA).approve(this.pool.address, 10);
      await this.pool.connect(userA).stake(10);

      expect(await this.univ2.balanceOf(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(10);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.pool.totalRewarded()).to.be.equal(0);
      expect(await this.pool.totalStaked()).to.be.equal(10);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(INITIAL_STAKE_MULTIPLE*10);
      expect(await this.pool.totalPhantom()).to.be.equal(INITIAL_STAKE_MULTIPLE*10);

      console.log("block moves from 0 to 2");
      await this.pool.setBlockNumber(2);
      let newTimestamp = initialTimestamp + (86400 * STAKE_LOCKUP_DURATION / 2);
      console.log("block timestamp ", newTimestamp);
      await this.pool.setBlockTimestamp(newTimestamp);
      expect(await this.pool.blockNumberE()).to.be.equal(2);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);

      console.log("B stakes 20");
      await this.univ2.faucet(addrUserB, 20);
      await this.univ2.connect(userB).approve(this.pool.address, 20);
      await this.pool.connect(userB).stake(20);

      expect(await this.univ2.balanceOf(addrUserB)).to.be.equal(0);
      expect(await this.pool.balanceOfStaked(addrUserB)).to.be.equal(20);
      expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(0);
      expect(await this.pool.totalRewarded()).to.be.equal(2);
      expect(await this.pool.totalStaked()).to.be.equal(30);
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(2);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(0);
      expect(await this.pool.balanceOfPhantom(addrUserB)).to.be.equal(4 + INITIAL_STAKE_MULTIPLE*20);
      expect(await this.pool.totalPhantom()).to.be.equal(4 + INITIAL_STAKE_MULTIPLE*30);

      console.log("A tries to harvest 3 rewards");
      await expect(this.pool.connect(userA).harvest(3)).to.be.revertedWith("insufficient rewarded balance");

      console.log("A harvests 1 reward");
      await this.pool.connect(userA).harvest(1);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(1);
      expect(await this.pool.totalVesting()).to.be.equal(1);
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(1);
      expect(await this.pool.totalRewarded()).to.be.equal(1);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(1 + INITIAL_STAKE_MULTIPLE*10);
      expect(await this.pool.totalPhantom()).to.be.equal(5 + INITIAL_STAKE_MULTIPLE*30);

      console.log("block moves from 2 to 32");
      await this.pool.setBlockNumber(32);
      newTimestamp = initialTimestamp + (86400 * STAKE_LOCKUP_DURATION);
      console.log("block timestamp ", newTimestamp);
      await this.pool.setBlockTimestamp(newTimestamp);
      expect(await this.pool.blockNumberE()).to.be.equal(32);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(10);
      expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(0);

      console.log("C stakes 30");
      await this.univ2.faucet(addrUserC, 30);
      await this.univ2.connect(userC).approve(this.pool.address, 30);
      await this.pool.connect(userC).stake(30);

      expect(await this.univ2.balanceOf(addrUserC)).to.be.equal(0);
      expect(await this.pool.balanceOfStaked(addrUserC)).to.be.equal(30);
      expect(await this.pool.balanceOfUnstakable(addrUserC)).to.be.equal(0);
      expect(await this.pool.totalRewarded()).to.be.equal(31);
      expect(await this.pool.totalStaked()).to.be.equal(60);
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(11);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(10);
      expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(20);
      expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(0);
      expect(await this.pool.balanceOfRewarded(addrUserC)).to.be.equal(0);
      expect(await this.pool.balanceOfPhantom(addrUserC)).to.be.equal(36 + INITIAL_STAKE_MULTIPLE*30);
      expect(await this.pool.totalPhantom()).to.be.equal(41 + INITIAL_STAKE_MULTIPLE*60);

      console.log("A harvets 5");
      await this.pool.connect(userA).harvest(5);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(6);
      expect(await this.pool.totalVesting()).to.be.equal(6);
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(6);
      expect(await this.pool.totalRewarded()).to.be.equal(26);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(6 + INITIAL_STAKE_MULTIPLE*10);
      expect(await this.pool.totalPhantom()).to.be.equal(46 + INITIAL_STAKE_MULTIPLE*60);

      console.log("B harvets 9");
      await this.pool.connect(userB).harvest(9);
      expect(await this.pool.balanceOfClaimable(addrUserB)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserB)).to.be.equal(9);
      expect(await this.pool.totalVesting()).to.be.equal(15);
      expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(11);
      expect(await this.pool.totalRewarded()).to.be.equal(17);
      expect(await this.pool.balanceOfPhantom(addrUserB)).to.be.equal(13 + INITIAL_STAKE_MULTIPLE*20);
      expect(await this.pool.totalPhantom()).to.be.equal(55 + INITIAL_STAKE_MULTIPLE*60);

      console.log("block moves from 32 to 38");
      await this.pool.setBlockNumber(38);
      newTimestamp = initialTimestamp + (86400 * STAKE_LOCKUP_DURATION * 3 / 2);
      console.log("block timestamp ", newTimestamp);
      await this.pool.setBlockTimestamp(newTimestamp);
      expect(await this.pool.blockNumberE()).to.be.equal(38);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(10);
      expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(20);
      expect(await this.pool.balanceOfUnstakable(addrUserC)).to.be.equal(0);

      console.log("A unstakes 10");
      await this.pool.connect(userA).unstake(10);

      expect(await this.pool.balanceOfStaked(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.pool.totalRewarded()).to.be.equal(16);
      expect(await this.pool.totalStaked()).to.be.equal(50);

      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserA)).to.be.equal(13);
      expect(await this.pool.totalVesting()).to.be.equal(22);
      expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(13);
      expect(await this.pool.balanceOfClaimable(addrUserB)).to.be.equal(0);
      expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(20);
      expect(await this.pool.balanceOfRewarded(addrUserC)).to.be.equal(3);
      expect(await this.pool.balanceOfClaimable(addrUserC)).to.be.equal(0);
      expect(await this.pool.balanceOfUnstakable(addrUserC)).to.be.equal(0);
      expect(await this.pool.balanceOfPhantom(addrUserA)).to.be.equal(0);
      expect(await this.pool.totalPhantom()).to.be.equal(49 + INITIAL_STAKE_MULTIPLE*50);

      console.log("B harvests 12");
      await this.pool.connect(userB).harvest(12);
      expect(await this.pool.balanceOfClaimable(addrUserB)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserB)).to.be.equal(21);
      expect(await this.pool.totalVesting()).to.be.equal(34);
      expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(1);
      expect(await this.pool.totalRewarded()).to.be.equal(4);
      expect(await this.pool.balanceOfPhantom(addrUserB)).to.be.equal(25 + INITIAL_STAKE_MULTIPLE*20);
      expect(await this.pool.totalPhantom()).to.be.equal(61 + INITIAL_STAKE_MULTIPLE*50);

      console.log("C harvests 3");
      await this.pool.connect(userC).harvest(3);
      expect(await this.pool.balanceOfClaimable(addrUserC)).to.be.equal(0);
      expect(await this.pool.balanceOfVesting(addrUserC)).to.be.equal(3);
      expect(await this.pool.totalVesting()).to.be.equal(37);
      expect(await this.pool.balanceOfRewarded(addrUserC)).to.be.equal(0);
      expect(await this.pool.totalRewarded()).to.be.equal(1);
      expect(await this.pool.balanceOfPhantom(addrUserC)).to.be.equal(39 + INITIAL_STAKE_MULTIPLE*30);
      expect(await this.pool.totalPhantom()).to.be.equal(64 + INITIAL_STAKE_MULTIPLE*50);

      console.log("block moves from 38 to 138");
      await this.pool.setBlockNumber(138);
      newTimestamp = initialTimestamp + (86400 * STAKE_LOCKUP_DURATION * 2);
      console.log("block timestamp ", newTimestamp);
      await this.pool.setBlockTimestamp(newTimestamp);
      expect(await this.pool.blockNumberE()).to.be.equal(138);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(20);
      expect(await this.pool.balanceOfUnstakable(addrUserC)).to.be.equal(30);

      console.log("D stakes 50");
      await this.univ2.faucet(addrUserD, 50);
      await this.univ2.connect(userD).approve(this.pool.address, 50);
      await this.pool.connect(userD).stake(50);

      expect(await this.pool.balanceOfStaked(addrUserD)).to.be.equal(50);
      expect(await this.pool.totalRewarded()).to.be.equal(101);
      expect(await this.pool.totalStaked()).to.be.equal(100);
      expect(await this.pool.balanceOfRewarded(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfClaimable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfUnstakable(addrUserA)).to.be.equal(0);
      expect(await this.pool.balanceOfRewarded(addrUserB)).to.be.equal(41);
      expect(await this.pool.balanceOfClaimable(addrUserB)).to.be.equal(1);
      expect(await this.pool.balanceOfUnstakable(addrUserB)).to.be.equal(20);
      expect(await this.pool.balanceOfRewarded(addrUserC)).to.be.equal(60);
      expect(await this.pool.balanceOfClaimable(addrUserC)).to.be.equal(0);
      expect(await this.pool.balanceOfUnstakable(addrUserC)).to.be.equal(30);
      expect(await this.pool.balanceOfRewarded(addrUserD)).to.be.equal(0);
      expect(await this.pool.balanceOfClaimable(addrUserD)).to.be.equal(0);
      expect(await this.pool.balanceOfUnstakable(addrUserD)).to.be.equal(0);
      expect(await this.pool.balanceOfPhantom(addrUserD)).to.be.equal(165 + INITIAL_STAKE_MULTIPLE*50);
      expect(await this.pool.totalPhantom()).to.be.equal(229 + INITIAL_STAKE_MULTIPLE*100);
    });
  });
});
