import { ethers } from "hardhat";
import { Signer } from "ethers";
import chai from "chai";
import { solidity } from "ethereum-waffle";

import { MockCOOK } from "../typechain/MockCOOK";
import { MockCookDistribution } from "../typechain/MockCookDistribution";
import { MockSettableOracle } from "../typechain/MockSettableOracle";
import { MockSettablePriceConsumerV3 } from "../typechain/MockSettablePriceConsumerV3";

chai.use(solidity);

const { expect } = chai;

const getAddress = async (signer: Signer) => {
  return await signer.getAddress();
}

const SECONDS_PER_DAY = 86400;
const TODAY_SECONDS = new Date().getTime();


const adjustStartDate = Math.round((new Date()).getTime() / 1000);
const TODAY_DAYS = Math.floor(adjustStartDate / SECONDS_PER_DAY);


describe("CookDistribution", () => {
  let token: MockCOOK;
  let cookInstance: MockCookDistribution;
  let oracle: MockSettableOracle;
  let priceConsumer: MockSettablePriceConsumerV3;


  let owner: Signer;
  let addr1: Signer;
  let addr2: Signer;
  let addr3: Signer;

  let ownerAddress: Promise<string>;
  let address1: Promise<string>
  let address2: Promise<string>;
  let address3: Promise<string>;

  beforeEach(async () => {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    [ownerAddress, address1, address2, address3] = [owner, addr1, addr2, addr3].map(signer => {
      return getAddress(signer)
    })

    const tokenFactory = await ethers.getContractFactory(
      "MockCOOK",
      owner
    );
    token = (await tokenFactory.deploy("1000000")) as MockCOOK;
    await token.deployed();

    const oracleFactory = await ethers.getContractFactory(
      "MockSettableOracle",
      owner
    );

    // oracle constructor should use pair address, but for MockSettableOracle we can use any address
    oracle = (await oracleFactory.deploy(token.address)) as MockSettableOracle;
    await oracle.deployed();

    const priceConsumerFactory = await ethers.getContractFactory(
      "MockSettablePriceConsumerV3",
      owner
    );
    priceConsumer = (await priceConsumerFactory.deploy()) as MockSettablePriceConsumerV3;
    await priceConsumer.deployed();

  })

  describe("Init", () => {

    beforeEach(async () => {

      const cookDistributionFactory = await ethers.getContractFactory(
        "MockCookDistribution",
        owner
      );
      //IERC20 token_,
      // address[] memory beneficiaries_,
      // uint256[] memory amounts_,
      // uint256 start, unix
      // uint256 duration, day
      cookInstance = (await cookDistributionFactory.deploy(token.address, [address1], [1200], adjustStartDate, 360, 30, oracle.address, priceConsumer.address)) as MockCookDistribution;
      await cookInstance.deployed();

      // transfer from owner to contract
      await token.transfer(cookInstance.address, '1000000');
    })


    it("deployer should have 0 balance after transfer", async () => {
      expect(await token.balanceOf(await owner.getAddress())).to.equal(0);
    });

    it("distributor should have total balance after transfer", async () => {
      expect(await token.balanceOf(cookInstance.address)).to.equal(1000000);
    });

    it("distributor initilized successfully", async () => {
      expect(await cookInstance.getUserVestingAmount(await addr1.getAddress())).to.equal(1200);
      expect(await cookInstance.startDay()).to.equal(TODAY_DAYS);
      expect(await cookInstance.duration()).to.equal(360);

    });

    it("can shift time", async () => {
      await cookInstance.setToday(TODAY_DAYS + 30);
      expect(await cookInstance.today()).to.equal(TODAY_DAYS + 30);
    })
  })

  describe("Access Controll", () => {
    beforeEach(async () => {

      const cookDistributionFactory = await ethers.getContractFactory(
        "MockCookDistribution",
        owner
      );

      cookInstance = (await cookDistributionFactory.deploy(token.address, [address1], [1200], adjustStartDate, 360, 30, oracle.address, priceConsumer.address)) as MockCookDistribution;
      await cookInstance.deployed();

      // transfer from owner to contract
      await token.transfer(cookInstance.address, '1000000');
    })

    it("grant manager role to an address", async () => {
      await expect(cookInstance.connect(addr1).setPriceBasedMaxStep(1000)).to.be.reverted;
      await expect(cookInstance.connect(addr1).getPriceBasedMaxSetp()).to.be.reverted;
      await expect(cookInstance.connect(addr1).getNextPriceUnlockStep()).to.be.reverted;
      await expect(cookInstance.connect(addr1).addAddressWithAllocation(await addr2.getAddress(), 2000)).to.be.reverted;
      await expect(cookInstance.connect(addr1).addMultipleAddressWithAllocations([await addr2.getAddress()], [2000])).to.be.reverted;
      await expect(cookInstance.connect(addr1).updatePricePercentage([10], [2000])).to.be.reverted;
      await expect(cookInstance.connect(addr1).getTotalAvailable()).to.be.reverted;
      await expect(cookInstance.connect(addr1).updatePriceFeed()).to.be.reverted;
      await expect(cookInstance.connect(addr1).blacklistAddress(await addr2.getAddress())).to.be.reverted;
      await expect(cookInstance.connect(addr1).removeAddressFromBlacklist(await addr2.getAddress())).to.be.reverted;
      await expect(cookInstance.connect(addr1).pauseClaim()).to.be.reverted;
      await expect(cookInstance.connect(addr1).resumeCliam()).to.be.reverted;

      await expect(cookInstance.connect(addr1).grantRole(await cookInstance.MANAGER_ROLE(), await addr2.getAddress())).to.be.reverted; 
      await expect(cookInstance.connect(addr1).grantRole(await cookInstance.ADMIN_ROLE(), await addr2.getAddress())).to.be.reverted; 
      await cookInstance.connect(owner).grantRole(await cookInstance.MANAGER_ROLE(), await addr1.getAddress())
      cookInstance.connect(addr1).pauseClaim()
      cookInstance.connect(addr1).resumeCliam()
    })
  })

  describe("Vesting", () => {
    beforeEach(async () => {

      const cookDistributionFactory = await ethers.getContractFactory(
        "MockCookDistribution",
        owner
      );

      cookInstance = (await cookDistributionFactory.deploy(token.address, [address1], [1200], adjustStartDate, 360, 30, oracle.address, priceConsumer.address)) as MockCookDistribution;
      await cookInstance.deployed();

      // transfer from owner to contract
      await token.transfer(cookInstance.address, '1000000');

    })

    it("has one percent vested", async () => {
      expect(await cookInstance.getUserVestedAmount(await addr1.getAddress(), TODAY_DAYS)).to.equal(12);
    })

    it("has one percent vested after 20 days", async () => {
      await cookInstance.setToday(TODAY_DAYS + 20);
      expect(await cookInstance.getUserVestedAmount(await addr1.getAddress(), 0)).to.equal(12);
    })

    it("has one percent vested after 29 days", async () => {
      await cookInstance.setToday(TODAY_DAYS + 29);
      expect(await cookInstance.getUserVestedAmount(await addr1.getAddress(), 0)).to.equal(12);
    })

    it("has 100 vested after 30 days", async () => {
      await cookInstance.setToday(TODAY_DAYS + 31);
      expect(await cookInstance.getUserVestedAmount(await addr1.getAddress(), 0)).to.equal(100);
    })

    it("has 200 vested after 61 days", async () => {
      await cookInstance.setToday(TODAY_DAYS + 61);
      expect(await cookInstance.getUserVestedAmount(await addr1.getAddress(), 0)).to.equal(200);
    })

    it("has total vested after 1000 days", async () => {
      await cookInstance.setToday(TODAY_DAYS + 1000);
      expect(await cookInstance.getUserVestedAmount(await addr1.getAddress(), 0)).to.equal(1200);
    })

    it("Admin emgergency withdraw all Cook", async () => {
      await expect(cookInstance.connect(addr1).emergencyWithdraw(1000000)).to.be.reverted;
      await expect(cookInstance.connect(owner).emergencyWithdraw(1000000))
      expect(await token.balanceOf(cookInstance.address)).to.equal(0)
    })
  })

  describe("Single withdraw", () => {
    beforeEach(async () => {

      const cookDistributionFactory = await ethers.getContractFactory(
        "MockCookDistribution",
        owner
      );

      cookInstance = (await cookDistributionFactory.deploy(token.address, [address1], [1200], adjustStartDate, 360, 30, oracle.address, priceConsumer.address)) as MockCookDistribution;
      await cookInstance.deployed();

      // transfer from owner to contract
      await token.transfer(cookInstance.address, '1000000');

      await cookInstance.setToday(TODAY_DAYS + 31);
      await cookInstance.connect(addr1).withdraw(30);
    });

    it("has 30 vested after after withdraw", async () => {
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(70);
      expect(await token.balanceOf(await addr1.getAddress())).to.equal(30);
    })

    it("will fail for insufficient balance", async () => {
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(70);
      expect(await cookInstance.connect(owner).getTotalAvailable()).to.equal(70);
      await expect(cookInstance.connect(addr1).withdraw(80)).to.be.revertedWith("insufficient avalible cook balance");

    })

    it("Will fail for someone not owner trying to get total available", async () => {
      await expect(cookInstance.connect(addr1).getTotalAvailable()).to.be.revertedWith("Caller is not a manager");
    })

    it("has right availableBalance after withdraw + new vested", async () => {
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(70);
      await cookInstance.setToday(TODAY_DAYS + 61);
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(170);
    })

    it("Admin pause and resume claim", async () => {
      await cookInstance.connect(owner).pauseClaim();
      await expect(cookInstance.connect(addr1).withdraw(30)).to.be.revertedWith("Cook token is not claimable due to emgergency");

      await cookInstance.connect(owner).resumeCliam();
      await expect(cookInstance.connect(addr1).withdraw(30))
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(40);

      await cookInstance.connect(owner).blacklistAddress(await addr1.getAddress());
      await expect(cookInstance.connect(addr1).withdraw(40)).to.be.revertedWith("Your address is blacklisted");

      await cookInstance.connect(owner).removeAddressFromBlacklist(await addr1.getAddress());
      await expect(cookInstance.connect(addr1).withdraw(40))
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(0);
    })
  })

  describe("Add Allocation", () => {
    beforeEach(async () => {

      const cookDistributionFactory = await ethers.getContractFactory(
        "MockCookDistribution",
        owner
      );

      cookInstance = (await cookDistributionFactory.deploy(token.address, [address1], [1200], adjustStartDate, 360, 30, oracle.address, priceConsumer.address)) as MockCookDistribution;
      await cookInstance.deployed();

      // transfer from owner to contract
      await token.transfer(cookInstance.address, '1000000');
    });

    it("address 2 is not registered", async () => {
      expect(await cookInstance.getRegisteredStatus(await addr2.getAddress())).to.equal(false);
    })

    it("others can not add allocation", async () => {
      await expect(cookInstance.connect(addr1).addAddressWithAllocation(await addr3.getAddress(), "1500")).to.be.revertedWith("Caller is not a manager");
    })

    it("address 2 should be registered with right amount", async () => {
      // add allocation for address2
      await cookInstance.connect(owner).addAddressWithAllocation(await addr2.getAddress(), "1500");

      expect(await cookInstance.getRegisteredStatus(await addr2.getAddress())).to.equal(true);
      expect(await cookInstance.getUserVestingAmount(await addr2.getAddress())).to.equal(1500);
    })

    it("add address3 after 180 days", async () => {
      // forward 181 days
      await cookInstance.setToday(TODAY_DAYS + 181);
      // add allocation for address3
      await cookInstance.connect(owner).addAddressWithAllocation(await addr3.getAddress(), "2000");

      expect(await cookInstance.getRegisteredStatus(await addr3.getAddress())).to.equal(true);
      expect(await cookInstance.getUserVestingAmount(await addr3.getAddress())).to.equal(2000);
      expect(await cookInstance.getUserAvailableAmount(await addr3.getAddress(), 0)).to.equal(1000);

      await cookInstance.connect(addr1).withdraw(100);

      await cookInstance.connect(addr3).withdraw(700);
      expect(await cookInstance.getUserAvailableAmount(await addr3.getAddress(), 0)).to.equal(300);
      await cookInstance.connect(addr3).withdraw(300);
      expect(await cookInstance.getUserAvailableAmount(await addr3.getAddress(), 0)).to.equal(0);

      expect(await cookInstance.connect(owner).getTotalAvailable()).to.equal(500);

      await expect(cookInstance.connect(owner).addAddressWithAllocation(await addr3.getAddress(), "1500")).to.be.revertedWith("The address to be added already exisits in the distribution contact, please use a new one");
    })

    it("add address2 and address3 after 180 days", async () => {
      // forward 181 days
      await cookInstance.setToday(TODAY_DAYS + 181);
      // add allocation for address3 and address2
      await cookInstance.connect(owner).addMultipleAddressWithAllocations([await addr2.getAddress(), await addr3.getAddress()], ["4000", "2000"]);

      expect(await cookInstance.getRegisteredStatus(await addr2.getAddress())).to.equal(true);
      expect(await cookInstance.getUserVestingAmount(await addr2.getAddress())).to.equal(4000);
      expect(await cookInstance.getUserAvailableAmount(await addr2.getAddress(), 0)).to.equal(2000);

      expect(await cookInstance.getRegisteredStatus(await addr3.getAddress())).to.equal(true);
      expect(await cookInstance.getUserVestingAmount(await addr3.getAddress())).to.equal(2000);
      expect(await cookInstance.getUserAvailableAmount(await addr3.getAddress(), 0)).to.equal(1000);

      await cookInstance.connect(addr1).withdraw(100);

      await cookInstance.connect(addr3).withdraw(700);
      expect(await cookInstance.getUserAvailableAmount(await addr3.getAddress(), 0)).to.equal(300);
      await cookInstance.connect(addr3).withdraw(300);
      expect(await cookInstance.getUserAvailableAmount(await addr3.getAddress(), 0)).to.equal(0);

      await cookInstance.connect(addr2).withdraw(700);
      expect(await cookInstance.getUserAvailableAmount(await addr2.getAddress(), 0)).to.equal(1300);
      await cookInstance.connect(addr2).withdraw(300);
      expect(await cookInstance.getUserAvailableAmount(await addr2.getAddress(), 0)).to.equal(1000);

      expect(await cookInstance.connect(owner).getTotalAvailable()).to.equal(500);

      await expect(cookInstance.connect(owner).addMultipleAddressWithAllocations([await addr3.getAddress()], ["1500"])).to.be.revertedWith("The address to be added already exisits in the distribution contact, please use a new one");
    })
  })

  describe("Price based unlock", () => {
    beforeEach(async () => {
      const cookDistributionFactory = await ethers.getContractFactory(
        "MockCookDistribution",
        owner
      );

      cookInstance = (await cookDistributionFactory.deploy(token.address, [address1], [1200], adjustStartDate, 360, 30, oracle.address, priceConsumer.address)) as MockCookDistribution;
      await cookInstance.deployed();

      // transfer from owner to contract
      await token.transfer(cookInstance.address, '1000000');

    });

    it("has zero vested before price update", async () => {
      expect(await cookInstance.getUserVestedAmount(await addr1.getAddress(), 0)).to.equal(0);
    })

    it("only owner can update price feed", async () => {
      await oracle.connect(addr1).set("5000");
      await expect(cookInstance.connect(addr1).updatePriceFeed()).to.be.revertedWith("Caller is not a manager");
    })

    it("after update price", async () => {
      // _priceKey = [500000,800000,1100000,1400000,1700000,2000000,2300000,2600000,2900000,3200000,3500000,3800000,4100000,4400000,4700000,5000000,5300000,5600000,5900000,6200000,6500000];
      // _percentageValue = [1,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100];

      //admin function
      expect(await cookInstance.connect(owner).getPriceBasedMaxSetp()).to.equal(1);
      await expect(cookInstance.connect(addr1).getPriceBasedMaxSetp()).to.be.reverted;

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("510000");
      await cookInstance.setToday(TODAY_DAYS + 1);
      await cookInstance.connect(owner).updatePriceFeed();

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("510000");
      await cookInstance.setToday(TODAY_DAYS + 2);
      await cookInstance.connect(owner).updatePriceFeed();

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("510000");
      await cookInstance.setToday(TODAY_DAYS + 3);
      await cookInstance.connect(owner).updatePriceFeed();

      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(12);

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("510000");
      await cookInstance.setToday(TODAY_DAYS + 4);
      await cookInstance.connect(owner).updatePriceFeed();

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("510000");
      await cookInstance.setToday(TODAY_DAYS + 5);
      await cookInstance.connect(owner).updatePriceFeed();

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("510000");
      await cookInstance.setToday(TODAY_DAYS + 6);
      await cookInstance.connect(owner).updatePriceFeed();
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(12);

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("510000");
      await cookInstance.setToday(TODAY_DAYS + 7);
      await cookInstance.connect(owner).updatePriceFeed();
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(12);

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("6900000");
      await cookInstance.setToday(TODAY_DAYS + 8);
      await cookInstance.connect(owner).updatePriceFeed();
      expect(await cookInstance.connect(owner).getNextPriceUnlockStep()).to.equal(1);
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(12);


      for (let i = 9; i < 18; i++) {
        await oracle.connect(owner).set("1000000000000000000");
        await priceConsumer.connect(owner).set("6800001");
        await cookInstance.setToday(TODAY_DAYS + i);
        await cookInstance.connect(owner).updatePriceFeed();
      }

      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(60);
      expect(await cookInstance.connect(owner).getNextPriceUnlockStep()).to.equal(2);

      for (let i = 18; i < 62; i++) {
        await oracle.connect(owner).set("1000000000000000000");
        await priceConsumer.connect(owner).set("1400001");
        await cookInstance.setToday(TODAY_DAYS + i);
        await cookInstance.connect(owner).updatePriceFeed();
      }
      expect(await cookInstance.connect(owner).getNextPriceUnlockStep()).to.equal(4);

      await oracle.connect(owner).set("1000000000000000000");
      await priceConsumer.connect(owner).set("1400001");
      await cookInstance.setToday(TODAY_DAYS + 62);
      await cookInstance.connect(owner).updatePriceFeed();

      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(200);

      await oracle.connect(owner).set("1");
      await priceConsumer.connect(owner).set("1");
      await cookInstance.setToday(TODAY_DAYS + 63);
      await cookInstance.connect(owner).updatePriceFeed();

      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(200);

      // Set Price Based Move step = 2
      expect(await cookInstance.connect(owner).setPriceBasedMaxStep(2));
      for (let i = 64; i < 73; i++) {
        await oracle.connect(owner).set("1000000000000000000");
        await priceConsumer.connect(owner).set("2300001");
        await cookInstance.setToday(TODAY_DAYS + i);
        await cookInstance.connect(owner).updatePriceFeed();
      }
      expect(await cookInstance.connect(owner).getNextPriceUnlockStep()).to.equal(6);

      await cookInstance.setToday(TODAY_DAYS + 301);
      expect(await cookInstance.getUserAvailableAmount(await addr1.getAddress(), 0)).to.equal(1000);
    })

  })

  describe("Price Schedule", () => {
    beforeEach(async () => {
      const cookDistributionFactory = await ethers.getContractFactory(
        "MockCookDistribution",
        owner
      );

      cookInstance = (await cookDistributionFactory.deploy(token.address, [address1], [1200], adjustStartDate, 360, 30, oracle.address, priceConsumer.address)) as MockCookDistribution;
      await cookInstance.deployed();

      // transfer from owner to contract
      await token.transfer(cookInstance.address, '1000000');

    });

    it("has correct init value", async () => {
      expect(await cookInstance.getPricePercentageMappingE(500000)).to.equal(1);
    })

    it("has correct after update", async () => {
      await cookInstance.connect(owner).updatePricePercentage([600000, 700000, 800000], [10, 11, 12]);
      expect(await cookInstance.getPricePercentageMappingE(600000)).to.equal(10);
    })

    it("has correct after update existing key", async () => {
      expect(await cookInstance.getPricePercentageMappingE(800000)).to.equal(5);
      await cookInstance.connect(owner).updatePricePercentage([400000, 800000, 1100000, 1400000, 1700000, 2000000, 2300000, 2600000, 2900000, 3200000, 3500000, 3800000, 4100000, 4400000, 4700000, 5000000, 5300000, 5600000, 5900000, 6200000, 6500000], [3, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
      expect(await cookInstance.getPricePercentageMappingE(800000)).to.equal(8);
      expect(await cookInstance.getPricePercentageMappingE(400000)).to.equal(3);
    })
  })

})
