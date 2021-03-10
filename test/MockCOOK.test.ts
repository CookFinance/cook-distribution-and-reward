import { ethers } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";

import { MockCOOK } from "../typechain/MockCOOK";

chai.use(solidity);

const { expect } = chai;

const getAddress = async (signer: Signer) => {
  return await signer.getAddress();
}


describe("MockCOOK", () => {
  let cookInstance: MockCOOK;
  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;

  let ownerAddress: Promise<string>;
  let address1: Promise<string>;
  let address2: Promise<string>;

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();
    [ownerAddress, address1, address2] = [owner, addr1, addr2].map(signer => {
      return getAddress(signer)
    })

    const cookFactory = await ethers.getContractFactory(
      "MockCOOK",
      owner
    );
    cookInstance = (await cookFactory.deploy("1000000")) as MockCOOK;
    await cookInstance.deployed();

  })

  describe("Init", () => {

    it("deployer should have total balance", async () => {

      expect(await cookInstance.balanceOf(await owner.getAddress())).to.equal(1000000);
    });
  })


})
