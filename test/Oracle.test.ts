import { ethers } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";

import { MockCOOK } from "../typechain/MockCOOK";
import { Oracle } from "../typechain/Oracle";
import { TestnetWETH } from "../typechain/TestnetWETH";
import { IUniswapV2Factory } from "../typechain/IUniswapV2Factory";

chai.use(solidity);


const { expect } = chai;

const UniswapV2FactoryBytecode = require('@uniswap/v2-core/build/UniswapV2Factory.json').bytecode;
const UniswapV2FactoryABI = require('@uniswap/v2-core/build/UniswapV2Factory.json').abi;

const UniswapV2Router02Bytecode = require('@uniswap/v2-periphery/build/UniswapV2Router02.json').bytecode;
const UniswapV2Router02ABI = require('@uniswap/v2-periphery/build/UniswapV2Router02.json').abi;

async function latest(addtime: number = 0) {

  const block = await ethers.provider.send("eth_getBlockByNumber", ['latest', false]);
  return ethers.BigNumber.from(block.timestamp).add(addtime);

}

async function increaseTime(time: number) {
  let currentTime = await latest();
  await ethers.provider.send("evm_increaseTime", [time]);
  await ethers.provider.send("evm_mine", []);

}

function roundPriceTolerance(numerator: number, denominator: number, tolerance: number = 1) {
  return ethers.BigNumber.from(numerator).mul(ethers.BigNumber.from(10).pow(18)).div(numerator).sub(ethers.BigNumber.from(tolerance).mul(ethers.BigNumber.from(10).pow(18)));
}

describe('Oracle', function () {
  let cook: MockCOOK;
  let weth: TestnetWETH;
  let oracle: Oracle;


  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let addr3: Signer;

  beforeEach(async function () {

    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const cookFactory = await ethers.getContractFactory(
      "MockCOOK",
      owner
    );
    cook = (await cookFactory.deploy("1000000000000000000000000")) as MockCOOK;
    this.cook = await cook.deployed();

    const wethFactory = await ethers.getContractFactory(
      "TestnetWETH",
      owner
    );
    weth = (await wethFactory.deploy()) as TestnetWETH;
    this.weth = await weth.deployed();

    const uniswapFactory = await ethers.getContractFactory(
      UniswapV2FactoryABI,
      UniswapV2FactoryBytecode,
      owner
    );

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

    await this.router.connect(owner).addLiquidity(this.cook.address, this.weth.address, "10000000000000000000000", "10000000000000000000000", "100", "100", await addr1.getAddress(), await latest(1000000000));

    const oracleFactory = await ethers.getContractFactory(
      "Oracle",
      owner
    );
    oracle = (await oracleFactory.deploy(this.pairAddress, this.cook.address)) as Oracle;
    this.oracle = await oracle.deployed();



  });

  describe('pair', function () {
    it('is returns pair', async function () {
      expect(await this.oracle.pair()).to.be.equal(this.pairAddress);
    });
  });

  describe('init liquidity', function () {
    it('pair has correct balances', async function () {
      expect(await this.cook.balanceOf(this.pairAddress)).to.equal('10000000000000000000000');
      expect(await this.weth.balanceOf(this.pairAddress)).to.equal('10000000000000000000000');
    });
  });

  describe('oracle single trade', function () {
    beforeEach(async function () {
      await this.cook.connect(addr1).mint(await addr1.getAddress(), '500000000000000000000');
      await this.cook.connect(addr1).approve(this.router.address, '500000000000000000000');
    });

    it('before trade', async function () {
      expect(await this.cook.balanceOf(await addr1.getAddress())).to.equal('500000000000000000000');
      expect(await this.cook.allowance(await addr1.getAddress(), this.router.address)).to.equal('500000000000000000000');
    });

    it('trade', async function () {
      await this.router.connect(addr1).swapExactTokensForTokens('500000000000000000000', '100', [this.cook.address, this.weth.address], await addr1.getAddress(), await latest(1000000000));
      await increaseTime(86400);
      await this.oracle.connect(owner).update();

      expect(await this.cook.balanceOf(await addr1.getAddress())).to.equal(0);
      expect(await this.cook.balanceOf(this.pairAddress)).to.equal('10500000000000000000000');
      expect(await this.weth.balanceOf(this.pairAddress)).to.gte('9525170262418440000000');
      expect(await this.oracle.latestPrice1()).to.gte(roundPriceTolerance(11023, 10000));
    });
  });

  describe('oracle multiple trade', function () {
    beforeEach(async function () {
      await this.cook.connect(addr1).mint(await addr1.getAddress(), '500000000000000000000');
      await this.cook.connect(addr1).approve(this.router.address, '500000000000000000000');

      await this.cook.connect(addr2).mint(await addr2.getAddress(), '500000000000000000000');
      await this.cook.connect(addr2).approve(this.router.address, '500000000000000000000');
    });

    it('before trade', async function () {
      expect(await this.cook.balanceOf(await addr1.getAddress())).to.equal('500000000000000000000');
      expect(await this.cook.allowance(await addr1.getAddress(), this.router.address)).to.equal('500000000000000000000');

      expect(await this.cook.balanceOf(await addr2.getAddress())).to.equal('500000000000000000000');
      expect(await this.cook.allowance(await addr2.getAddress(), this.router.address)).to.equal('500000000000000000000');
    });

    it('trade', async function () {
      await this.router.connect(addr1).swapExactTokensForTokens('500000000000000000000', '100', [this.cook.address, this.weth.address], await addr1.getAddress(), await latest(1000000000));
      await increaseTime(43200);
      await this.router.connect(addr2).swapExactTokensForTokens('500000000000000000000', '100', [this.cook.address, this.weth.address], await addr2.getAddress(), await latest(1000000000));
      await increaseTime(43200);
      await this.oracle.connect(owner).update();


      expect(await this.cook.balanceOf(await addr1.getAddress())).to.equal(0);
      expect(await this.cook.balanceOf(await addr2.getAddress())).to.equal(0);
      expect(await this.cook.balanceOf(this.pairAddress)).to.equal('11000000000000000000000');
      expect(await this.weth.balanceOf(this.pairAddress)).to.gte('9092148000000000000000');
      expect(await this.oracle.latestPrice1()).to.gte(roundPriceTolerance(112855, 100000));
    });
  });
});
