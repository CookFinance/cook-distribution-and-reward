import { ethers } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";

import { MockCOOK } from "../typechain/MockCOOK";
import { Oracle } from "../typechain/Oracle";
import { CookPool } from "../typechain/CookPool";
import { TestnetWETH } from "../typechain/TestnetWETH";
import { MockCookDistribution } from "../typechain/MockCookDistribution";
import { MockSettablePriceConsumerV3 } from "../typechain/MockSettablePriceConsumerV3";

chai.use(solidity);

const { expect } = chai;

const UniswapV2FactoryBytecode = require('@uniswap/v2-core/build/UniswapV2Factory.json').bytecode;
const UniswapV2FactoryABI = require('@uniswap/v2-core/build/UniswapV2Factory.json').abi;

const UniswapV2Router02Bytecode = require('@uniswap/v2-periphery/build/UniswapV2Router02.json').bytecode;
const UniswapV2Router02ABI = require('@uniswap/v2-periphery/build/UniswapV2Router02.json').abi;

const SECONDS_PER_DAY = 86400;
const TODAY_SECONDS = new Date().getTime();

const adjustStartDate = Math.round((new Date()).getTime() / 1000);
const TODAY_DAYS = Math.floor(adjustStartDate / SECONDS_PER_DAY);

const getAddress = async (signer: Signer) => {
  return await signer.getAddress();
}

async function latest(addtime: number = 0) {

  const block = await ethers.provider.send("eth_getBlockByNumber", ['latest', false]);
  return ethers.BigNumber.from(block.timestamp).add(addtime);

}

describe("Zap Cook", () => {
  let token: MockCOOK;
  let cookInstance: MockCookDistribution;
  let oracle: Oracle;
  let priceConsumer: MockSettablePriceConsumerV3;
  let cookPoolInstance: CookPool;

  let weth: TestnetWETH;

  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let addr3: Signer;

  let ownerAddress: Promise<string>;
  let address1: Promise<string>
  let address2: Promise<string>;
  let address3: Promise<string>;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    [ownerAddress, address1, address2, address3] = [owner, addr1, addr2, addr3].map(signer => {
      return getAddress(signer)
    })

    // cook
    const tokenFactory = await ethers.getContractFactory(
      "MockCOOK",
      owner
    );
    token = (await tokenFactory.deploy("1000000")) as MockCOOK;
    this.cook = await token.deployed();

    // priceConsumer
    const priceConsumerFactory = await ethers.getContractFactory(
      "MockSettablePriceConsumerV3",
      owner
    );

    priceConsumer = (await priceConsumerFactory.deploy()) as MockSettablePriceConsumerV3;
    this.priceConsumer = await priceConsumer.deployed();

    // weth
    const wethFactory = await ethers.getContractFactory(
      "TestnetWETH",
      owner
    );

    weth = (await wethFactory.deploy()) as TestnetWETH;
    this.weth = await weth.deployed();
    // console.log('weth address:',this.weth.address);

    const uniswapFactory = await ethers.getContractFactory(
      UniswapV2FactoryABI,
      UniswapV2FactoryBytecode,
      owner
    );

    // uniswap
    this.uni = await uniswapFactory.deploy(await owner.getAddress());
    this.uniswap = await this.uni.deployed();

    await this.uniswap.connect(owner).createPair(this.cook.address, this.weth.address);

    this.pairAddress = await this.uniswap.connect(owner).getPair(this.cook.address, this.weth.address);

    this.pair = await ethers.getContractAt("IUniswapV2Pair", this.pairAddress, owner);

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

    await this.router.connect(owner).addLiquidity(this.cook.address, this.weth.address, "10000000000000000000000", "1000000000000000000", "100", "100", await addr1.getAddress(), await latest(1000000000));

    // oracle
    const oracleFactory = await ethers.getContractFactory(
      "Oracle",
      owner
    );
    oracle = (await oracleFactory.deploy(this.pairAddress, this.cook.address)) as Oracle;
    this.oracle = await oracle.deployed();


    // cook pool
    const poolFactory = await ethers.getContractFactory(
      "CookPool",
      owner
    );

    cookPoolInstance = (await poolFactory.deploy(this.cook.address, 1, 0, 0)) as CookPool;
    this.cookPool = await cookPoolInstance.deployed();

    this.cook.connect(owner).mint(this.cookPool.address, '1000000000000000000000000');

    // cookDistribution
    const cookDistributionFactory = await ethers.getContractFactory(
      "MockCookDistribution",
      owner
    );

    cookInstance = (await cookDistributionFactory.deploy(this.cook.address, [address1, address2], ["1200000000000000000000", "1200000000000000000000"], adjustStartDate, 360, 30, this.oracle.address, this.priceConsumer.address)) as MockCookDistribution;
    this.cookDistribution = await cookInstance.deployed();

    // mint cook to cookDistribution
    await this.cook.mint(this.cookDistribution.address, "1000000000000000000000000");
  })

  describe('single zap', function () {
    it('before zap', async function () {
      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(0);
      expect(await this.cookPool.balanceOfStaked(await addr1.getAddress())).to.be.equal(0);
    });

    it('zap 0 cook', async function () {
      await expect(this.cookDistribution.connect(addr1).zapCook(0, this.cookPool.address)).to.be.revertedWith("zero zap amount");
    });

    it('zap over claimable balance', async function () {
      await expect(this.cookDistribution.connect(addr1).zapCook(1, this.cookPool.address)).to.be.revertedWith("insufficient avalible cook balance");
    });

    it('zap 100 cook', async function () {
      await this.cookDistribution.setToday(TODAY_DAYS + 31);
      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal('100000000000000000000');
      await this.cookDistribution.connect(addr1).zapCook('100000000000000000000', this.cookPool.address);

      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(0);
      expect(await this.cookPool.balanceOfStaked(await addr1.getAddress())).to.be.equal('100000000000000000000');
    });

    it('blacklist or pause claim', async function () {
      await this.cookDistribution.setToday(TODAY_DAYS + 61);
      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal('200000000000000000000');

      await cookInstance.connect(owner).pauseClaim();
      await expect(cookInstance.connect(addr1).zapCook('100000000000000000000', this.cookPool.address)).to.be.revertedWith("Cook token cane not be zap due to emgergency");

      await cookInstance.connect(owner).resumeCliam();
      await this.cookDistribution.connect(addr1).zapCook('100000000000000000000', this.cookPool.address);

      await cookInstance.connect(owner).blacklistAddress(await addr1.getAddress());
      await expect(cookInstance.connect(addr1).zapCook('100000000000000000000', this.cookPool.address)).to.be.revertedWith("Your address is blacklisted");

      await cookInstance.connect(owner).removeAddressFromBlacklist(await addr1.getAddress());
      await this.cookDistribution.connect(addr1).zapCook('100000000000000000000', this.cookPool.address);
    })

    it('Cap limit', async function () {
      await this.cookDistribution.setToday(TODAY_DAYS + 61);
      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal('200000000000000000000');

      await this.cookPool.connect(owner).setTotalPoolCapLimit(1);
      await expect(cookInstance.connect(addr1).zapCook('100000000000000000000', this.cookPool.address)).to.be.revertedWith('The amount to be staked will exceed pool limit');

      await this.cookPool.connect(owner).setTotalPoolCapLimit('300000000000000000000');
      await this.cookPool.connect(owner).setStakeLimitPerAddress(1);
      await expect(cookInstance.connect(addr1).zapCook('100000000000000000000', this.cookPool.address)).to.be.revertedWith('The amount to be staked will exceed per address stake limit');

      await cookPoolInstance.connect(owner).setStakeLimitPerAddress('300000000000000000000');

      await this.cookDistribution.connect(addr1).zapCook('200000000000000000000', this.cookPool.address);
    })

    it('multilple zap', async function () {
      await this.cookDistribution.setToday(TODAY_DAYS + 91);
      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal('300000000000000000000');
      await this.cookDistribution.connect(addr1).zapCook('100000000000000000000', this.cookPool.address);

      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal('200000000000000000000');
      expect(await this.cookPool.balanceOfStaked(await addr1.getAddress())).to.be.equal('100000000000000000000');

      await this.cookDistribution.connect(addr1).zapCook('100000000000000000000', this.cookPool.address);

      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal('100000000000000000000');
      expect(await this.cookPool.balanceOfStaked(await addr1.getAddress())).to.be.equal('200000000000000000000');

      await this.cookDistribution.connect(addr1).zapCook('100000000000000000000', this.cookPool.address);

      expect(await this.cookDistribution.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal('0');
      expect(await this.cookPool.balanceOfStaked(await addr1.getAddress())).to.be.equal('300000000000000000000');
    });
  });
})
