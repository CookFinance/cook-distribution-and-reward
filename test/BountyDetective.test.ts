import { ethers, network } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";

import { MockCOOK } from "../typechain/MockCOOK";
import { BountyDetective } from "../typechain/BountyDetective";

chai.use(solidity);

const { expect } = chai;

const getAddress = async (signer: Signer) => {
  return await signer.getAddress();
}

const NOW = new Date();
const UNLOCK_TIMESTAMP = NOW.valueOf() + 3600; // 1 hour later

describe("BountyDetective", () => {
  let token: MockCOOK;
  let bountyDetective: BountyDetective;
  
  let owner: Signer;
  let detective: Signer;

  let ownerAddress: String;
  let detectiveAddress: String;

  beforeEach(async () => {
    [owner, detective] = await ethers.getSigners();
    ownerAddress = await getAddress(owner);
    detectiveAddress = await getAddress(detective);

    const tokenFactory = await ethers.getContractFactory(
      "MockCOOK",
      owner
    );
    token = (await tokenFactory.deploy("1000000")) as MockCOOK;
    await token.deployed();

    const bountyDetectiveFactory = await ethers.getContractFactory(
      "BountyDetective",
      owner
    );

    // IERC20 _token,
    // uint256 _unlockTimestamp,
    // address _detectiveAddress
    bountyDetective = (await bountyDetectiveFactory.deploy(token.address, UNLOCK_TIMESTAMP, detectiveAddress)) as BountyDetective;
    await bountyDetective.deployed();

    // transfer from owner to contract
    await token.transfer(bountyDetective.address, '1000000');
  })

  describe("Init", () => {
    it("should be initialized successfully", async () => {
      expect(await bountyDetective.getUnlockTimestamp()).to.equal(UNLOCK_TIMESTAMP);
      expect(await bountyDetective.getDetectiveAddress()).to.equal(detectiveAddress);
      expect(await bountyDetective.getTokenAddress()).to.equal(token.address);
    });

    it("deployer should have 0 balance after transfer", async () => {
      expect(await token.balanceOf(await owner.getAddress())).to.equal(0);
    });

    it("bounty should have expected amount", async () => {
      expect(await token.balanceOf(bountyDetective.address)).to.equal(1000000);
    });
  })

  describe("Claim", () => {
    it("bounty should have total balance as vesting amount", async () => {
      expect(await bountyDetective.getVestingToken()).to.equal(1000000);
    });

    it("bounty should have 0 claimable amount", async () => {
      expect(await bountyDetective.getClaimableToken()).to.equal(0);
    });

    it("should be done after the unlock time", async () => {
      const NEW_TIMESTAMP = NOW.valueOf() + 2600;
      await network.provider.send("evm_setNextBlockTimestamp", [NEW_TIMESTAMP]);
      await network.provider.send("evm_mine");

      await expect(bountyDetective.connect(detective).claim()).to.be.revertedWith("should wait");
    })

    it("should be done by only detective address", async () => {
      const NEW_TIMESTAMP = NOW.valueOf() + 3600;
      await network.provider.send("evm_setNextBlockTimestamp", [NEW_TIMESTAMP]);
      await network.provider.send("evm_mine");

      await expect(bountyDetective.connect(owner).claim()).to.be.revertedWith("should be bounty detective address");
    })

    it("should be done successfully", async () => {
      const NEW_TIMESTAMP = NOW.valueOf() + 4600;
      await network.provider.send("evm_setNextBlockTimestamp", [NEW_TIMESTAMP]);
      await network.provider.send("evm_mine");

      await bountyDetective.connect(detective).claim();

      expect(await bountyDetective.getClaimableToken()).to.equal(0);
      expect(await bountyDetective.getVestingToken()).to.equal(0);
      expect(await token.balanceOf(await detective.getAddress())).to.equal(1000000);
    })

    it("can't claim twice", async () => {
      await bountyDetective.connect(detective).claim();

      await expect(bountyDetective.connect(detective).claim()).to.be.revertedWith("insufficient amount");
    })
  })
})
