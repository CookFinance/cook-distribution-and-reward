import chai from "chai";
import {solidity} from "ethereum-waffle";
import {ethers} from "hardhat";
import {BigNumber, BigNumberish, ContractFactory, Signer} from "ethers";

import {StakingPools} from "../../typechain/StakingPools";
import { RewardVesting } from "../../typechain/RewardVesting";
import { MockCOOK } from "../../typechain/MockCOOk";
import {MAXIMUM_U256, mineBlocks, ZERO_ADDRESS} from "../utils/helper";

chai.use(solidity);

const {expect} = chai;

let StakingPoolsFactory: ContractFactory;
let RewardVestingFactory: ContractFactory;
let MockCOOKFactory: ContractFactory;

describe("StakingPools", () => {
  let deployer: Signer;
  let governance: Signer;
  let newGovernance: Signer;
  let sentinel: Signer;
  let newSentinel: Signer;
  let signers: Signer[];

  let pools: StakingPools;
  let reward: MockCOOK;
  let rewardVesting: RewardVesting;
  let rewardRate = 5000;


  before(async () => {
    StakingPoolsFactory = await ethers.getContractFactory("StakingPools");
    MockCOOKFactory = await ethers.getContractFactory("MockCOOK");
    RewardVestingFactory = await ethers.getContractFactory("RewardVesting");
  });

  beforeEach(async () => {
    [deployer, governance, newGovernance, sentinel, newSentinel, ...signers] = await ethers.getSigners();

    reward = (await MockCOOKFactory.connect(deployer).deploy(
      "100000000000000000000000000"
    )) as MockCOOK;

    rewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
    await rewardVesting.connect(governance).initialize(reward.address,60,300);

    pools = (await StakingPoolsFactory.connect(deployer).deploy(
      reward.address,
      await governance.getAddress(),
      await sentinel.getAddress(),
      rewardVesting.address
    )) as StakingPools;

     reward.connect(deployer).transfer(pools.address, "1000000000000000000000000"); 
  });

  describe("set governance", () => {
    it("only allows governance", async () => {
      expect(pools.setPendingGovernance(await newGovernance.getAddress())).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", () => {
      beforeEach(async () => {
        pools = pools.connect(governance);
      });

      it("prevents getting stuck", async () => {
        expect(pools.setPendingGovernance(ZERO_ADDRESS)).revertedWith(
          "StakingPools: pending governance address cannot be 0x0"
        );
      });

      it("sets the pending governance", async () => {
        await pools.setPendingGovernance(await newGovernance.getAddress());
        expect(await pools.governance()).equal(await governance.getAddress());
      });

      it("updates governance upon acceptance", async () => {
        await pools.setPendingGovernance(await newGovernance.getAddress());
        await pools.connect(newGovernance).acceptGovernance()
        expect(await pools.governance()).equal(await newGovernance.getAddress());
      });

      it("emits GovernanceUpdated event", async () => {
        await pools.setPendingGovernance(await newGovernance.getAddress());
        expect(pools.connect(newGovernance).acceptGovernance())
          .emit(pools, "GovernanceUpdated")
          .withArgs(await newGovernance.getAddress());
      });
    });
  });

  describe("set reward rate", () => {
    let newRewardRate: BigNumberish = 100000;

    it("only allows governance to call", async () => {
      expect(pools.setRewardRate(newRewardRate)).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("updates reward rate", async () => {
        await pools.setRewardRate(newRewardRate);
        expect(await pools.rewardRate()).equal(newRewardRate);
      });

      it("emits RewardRateUpdated event", async () => {
        expect(pools.setRewardRate(newRewardRate))
          .emit(pools, "RewardRateUpdated")
          .withArgs(newRewardRate);
      });
    });
  });

  describe("set pause", () => {

    it("only allows governance or sentinel to call", async () => {
      expect(pools.setPause(true)).revertedWith(
        "StakingPools: !(gov || sentinel)"
      );
      expect(await pools.pause()).equal(false);
    });

    context("when caller is governance", () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("set pause to true", async () => {
        await pools.setPause(true);
        expect(await pools.pause()).equal(true);
      });

      it("emits PauseUpdated event", async () => {
        expect(pools.setPause(true))
          .emit(pools, "PauseUpdated")
          .withArgs(true);
      });
    });

    context("when caller is sentinel", () => {
      beforeEach(async () => (pools = pools.connect(sentinel)));

      it("set pause to true", async () => {
        await pools.setPause(true);
        expect(await pools.pause()).equal(true);
      });

      it("emits PauseUpdated event", async () => {
        expect(pools.setPause(true))
          .emit(pools, "PauseUpdated")
          .withArgs(true);
      });
    });
  });

  describe("set sentinel", () => {

    it("only allows governance to call", async () => {
      expect(pools.setSentinel(await newSentinel.getAddress())).revertedWith(
        "StakingPools: only governance"
      );
      expect(await pools.sentinel()).equal(await sentinel.getAddress());
    });

    context("when caller is governance", () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("prevents getting stuck", async () => {
        expect(pools.setSentinel(ZERO_ADDRESS)).revertedWith(
          "StakingPools: sentinel address cannot be 0x0."
        );
      });

      it("set sentinel to new address", async () => {
        await pools.setSentinel(await newSentinel.getAddress());
        expect(await pools.sentinel()).equal(await newSentinel.getAddress());
      });

      it("emits SentinelUpdated event", async () => {
        expect(pools.setSentinel(await newSentinel.getAddress()))
          .emit(pools, "SentinelUpdated")
          .withArgs(await newSentinel.getAddress());
      });
    });
  });

  describe("set reward vesting", () => {
   
    it("only allows governance or sentinel to call", async () => {
      let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
      await newRewardVesting.connect(governance).initialize(reward.address,120,600);

      expect(pools.setRewardVesting(newRewardVesting.address)).revertedWith(
        "StakingPools: not paused, or not governance or sentinel"
      );
      expect(await pools.rewardVesting()).equal(rewardVesting.address);
    });

    context("when caller is governance", () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("only allows in the pause mode", async () => {
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address,120,600);
  
        expect(pools.setRewardVesting(newRewardVesting.address)).revertedWith(
          "StakingPools: not paused, or not governance or sentinel"
        );
        expect(await pools.rewardVesting()).equal(rewardVesting.address);
      });

      it("set reward vesting to new contract", async () => {
        await pools.connect(governance).setPause(true);
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address,120,600);

        await pools.setRewardVesting(newRewardVesting.address);
        expect(await pools.rewardVesting()).equal(newRewardVesting.address);
      });

      it("emits RewardVestingUpdated event", async () => {
        await pools.connect(governance).setPause(true);
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address,120,600);

        expect(pools.setRewardVesting(newRewardVesting.address))
          .emit(pools, "RewardVestingUpdated")
          .withArgs(newRewardVesting.address);
      });
    });

    context("when caller is sentinel", () => {
      beforeEach(async () => (pools = pools.connect(sentinel)));

      it("only allows in the pause mode", async () => {
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address,120,600);
  
        expect(pools.setRewardVesting(newRewardVesting.address)).revertedWith(
          "StakingPools: not paused, or not governance or sentinel"
        );
        expect(await pools.rewardVesting()).equal(rewardVesting.address);
      });

      it("set reward vesting to new contract", async () => {
        await pools.connect(governance).setPause(true);
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address,120,600);

        await pools.setRewardVesting(newRewardVesting.address);
        expect(await pools.rewardVesting()).equal(newRewardVesting.address);
      });

      it("emits RewardVestingUpdated event", async () => {
        await pools.connect(governance).setPause(true);
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address,120,600);

        expect(pools.setRewardVesting(newRewardVesting.address))
          .emit(pools, "RewardVestingUpdated")
          .withArgs(newRewardVesting.address);
      });
    });
  });

  describe("create pool", () => {
    let token: MockCOOK;

    beforeEach(async () => {
      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;
    });

    it("only allows governance to call", async () => {
      expect(pools.createPool(token.address,true)).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", async () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("emits PoolCreated event", async () => {
        expect(pools.createPool(token.address,true))
          .emit(pools, "PoolCreated")
          .withArgs(0, token.address);
      });

      context("when reusing token", async () => {
        it("reverts", async () => {
          await pools.createPool(token.address,true);
          expect(pools.createPool(token.address,true)).revertedWith("StakingPools: token already has a pool");
        });
      });
    });
  });

  describe("set pool reward weights", () => {
    it("only allows governance to call", async () => {
      expect(pools.setRewardRate([1])).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      const shouldBehaveLikeSetRewardWeights = (
        rewardWeights: BigNumberish[]
      ) => {
        beforeEach(async () => {
          await pools.setRewardWeights(rewardWeights);
        });

        it("updates the total reward weight", async () => {
          const totalWeight = rewardWeights
            .map((value) => BigNumber.from(value))
            .reduce((acc, value) => acc.add(value), BigNumber.from(0));

          expect(await pools.totalRewardWeight()).equal(totalWeight);
        });

        it("updates the reward weights", async () => {
          for (let poolId = 0; poolId < rewardWeights.length; poolId++) {
            expect(await pools.getPoolRewardWeight(poolId)).equal(rewardWeights[poolId]);
          }
        });
      };

      it("reverts when weight array length mismatches", () => {
        expect(pools.setRewardWeights([1])).revertedWith(
          "StakingPools: weights length mismatch"
        );
      });

      context("with one pool", async () => {
        let token: MockCOOK;

        beforeEach(async () => {
          token = (await MockCOOKFactory.connect(deployer).deploy(
            "1000000000000000000"
          )) as MockCOOK;
        });

        beforeEach(async () => {
          await pools.connect(governance).createPool(token.address,true);
        });

        shouldBehaveLikeSetRewardWeights([10000]);
      });

      context("with many pools", async () => {
        let numberPools = 5;
        let tokens: MockCOOK[];

        beforeEach(async () => {
          tokens = new Array<MockCOOK>();
          for (let i = 0; i < numberPools; i++) {
            tokens.push(
              (await MockCOOKFactory.connect(deployer).deploy(
                "1000000000000000000"
              )) as MockCOOK
            );
          }
        });

        beforeEach(async () => {
          for (let n = 0; n < numberPools; n++) {
            await pools
              .connect(governance)
              .createPool(tokens[n].address,true);
          }
        });

        shouldBehaveLikeSetRewardWeights([
          10000,
          20000,
          30000,
          40000,
          50000,
        ]);
      });
    });
  });

  describe("deposit tokens", () => {
    let depositor: Signer;
    let token: MockCOOK;

    beforeEach(async () => {
      [depositor, ...signers] = signers;
      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;
      await pools.connect(governance).createPool(token.address,true);
      await pools.connect(governance).setRewardWeights([1]);
    });

    const shouldBehaveLikeDeposit = (
      poolId: BigNumberish,
      amount: BigNumberish
    ) => {
      let startingTokenBalance: BigNumber;
      let startingTotalDeposited: BigNumber;
      let startingDeposited: BigNumber;

      beforeEach(async () => {
        startingTokenBalance = await token.balanceOf(await depositor.getAddress());
        startingTotalDeposited = await pools.getPoolTotalDeposited(0);
        startingDeposited = await pools.getStakeTotalDeposited(await depositor.getAddress(), 0);

        await token.approve(pools.address, amount);
        await pools.deposit(poolId, amount);
      });

      it("increments total deposited amount", async () => {
        expect(await pools.getPoolTotalDeposited(0))
          .equal(startingTotalDeposited.add(amount));
      });

      it("increments deposited amount", async () => {
        expect(await pools.getStakeTotalDeposited(await depositor.getAddress(), 0))
          .equal(startingDeposited.add(amount));
      });

      it("transfers deposited tokens", async () => {
        expect(await token.balanceOf(await depositor.getAddress()))
          .equal(startingTokenBalance.sub(amount));
      });
    };

    context("with no previous deposits", async () => {
      let depositAmount = 50000;

      beforeEach(async () => (pools = pools.connect(depositor)));
      beforeEach(async () => (token = token.connect(depositor)));

      beforeEach(async () => {
        await token.mint(await depositor.getAddress(), depositAmount);
      });

      shouldBehaveLikeDeposit(0, depositAmount);

      it("does not reward tokens", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0))
          .equal(0);
      });
    });

    context("with previous deposits", async () => {
      let initialDepositAmount = 50000;
      let depositAmount = 100000;

      beforeEach(async () => (pools = pools.connect(depositor)));
      beforeEach(async () => (token = token.connect(depositor)));

      beforeEach(async () => {
        await token.mint(
          await depositor.getAddress(),
          initialDepositAmount + depositAmount
        );
        await token.approve(pools.address, initialDepositAmount);
        await pools.deposit(0, initialDepositAmount);
      });

      shouldBehaveLikeDeposit(0, depositAmount);
    });
  });

  describe("withdraw tokens", () => {
    let depositor: Signer;
    let token: MockCOOK;

    beforeEach(async () => {
      [depositor, ...signers] = signers;
      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;

      await pools.connect(governance).createPool(token.address,true);
      await pools.connect(governance).setRewardWeights([1]);
    });

    const shouldBehaveLikeWithdraw = (
      poolId: BigNumberish,
      amount: BigNumberish
    ) => {
      let startingTokenBalance: BigNumber;
      let startingTotalDeposited: BigNumber;
      let startingDeposited: BigNumber;

      beforeEach(async () => {
        startingTokenBalance = await token.balanceOf(await depositor.getAddress());
        startingTotalDeposited = await pools.getPoolTotalDeposited(0);
        startingDeposited = await pools.getStakeTotalDeposited(await depositor.getAddress(), 0);
      });

      context("when in pause mode", () => {
        beforeEach(async () => {
          await pools.connect(governance).setPause(true);
        });

        it("only allow withdraw reward when not in pause mode", async () => {
          expect(pools.withdraw(poolId, amount)).revertedWith(
            "StakingPools: emergency pause enabled"
          );
        });
      });

      context("when not in pause mode", () => {
        beforeEach(async () => {
          await pools.withdraw(poolId, amount);
        });
  
        it("decrements total deposited amount", async () => {
          expect(await pools.getPoolTotalDeposited(0))
            .equal(startingTotalDeposited.sub(amount));
        });
  
        it("decrements deposited amount", async () => {
          expect(await pools.getStakeTotalDeposited(await depositor.getAddress(), 0))
            .equal(startingDeposited.sub(amount));
        });
  
        it("transfers deposited tokens", async () => {
          expect(await token.balanceOf(await depositor.getAddress())).equal(
            startingTokenBalance.add(amount)
          );
        });
      });
    };

    context("with previous deposits", async () => {
      let depositAmount = 50000;
      let withdrawAmount = 25000;

      beforeEach(async () => {
        token = token.connect(depositor)
        await token.connect(deployer).mint(await depositor.getAddress(), MAXIMUM_U256);
        await token.connect(depositor).approve(pools.address, MAXIMUM_U256);
        await token.mint(await depositor.getAddress(), depositAmount);
        await token.approve(pools.address, depositAmount);

        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
      });

      shouldBehaveLikeWithdraw(0, withdrawAmount)
    });
  });

  describe("claim tokens", () => {
    let depositor: Signer;
    let token: MockCOOK;

    let rewardWeight = 1;
    let depositAmount = 50000;
    let rewardRate = 1000;

    beforeEach(async () => {
      [depositor, ...signers] = signers;

      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;
    });

    beforeEach(async () => (token = token.connect(depositor)));

    beforeEach(async () => {
      await token.mint(await depositor.getAddress(), MAXIMUM_U256);
      await token.approve(pools.address, MAXIMUM_U256);
    });

    beforeEach(async () => (pools = pools.connect(governance)));

    beforeEach(async () => {
      await pools.createPool(token.address,true);
      await pools.setRewardWeights([rewardWeight]);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 1000;

      context("when in pause mode", () => {
        beforeEach(async () => {
          await pools.connect(governance).setPause(true);
          pools = pools.connect(depositor)
          await pools.deposit(0, depositAmount);
          await mineBlocks(ethers.provider, elapsedBlocks);
        });

        it("only allow claim reward when not in pause mode", async () => {
          expect(pools.claim(0)).revertedWith(
            "StakingPools: emergency pause enabled"
          );
        });
      });
      
      context("when not in pause mode", () => {
        beforeEach(async () => {
          await pools.connect(governance).setRewardRate(rewardRate);
          pools = pools.connect(depositor)
          await pools.deposit(0, depositAmount);
          await mineBlocks(ethers.provider, elapsedBlocks);
          await pools.claim(0);
        });
  
        it("mints reward tokens", async () => {
          const rewardAmount = rewardRate * (elapsedBlocks + 1);
  
          expect(await rewardVesting.userBalances(await depositor.getAddress())).gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
        });
  
        it("clears unclaimed amount", async () => {
          expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);
        });
      });

      context("when using a new reward vesting address", () => {
        it("mints reward tokens and clears unclaimed amount", async () => {
          await pools.connect(governance).setRewardRate(rewardRate);
          await pools.connect(governance).setPause(true);
          var newRewardVesting = (await RewardVestingFactory.connect(
            deployer
          ).deploy(await governance.getAddress())) as RewardVesting;
          await newRewardVesting
            .connect(governance)
            .initialize(reward.address, 120, 600);
          await pools.setRewardVesting(newRewardVesting.address);
          await pools.connect(governance).setPause(false);

          pools = pools.connect(depositor);
          await pools.deposit(0, depositAmount);
          await mineBlocks(ethers.provider, elapsedBlocks);
          await pools.claim(0);

          expect(
            await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)
          ).equal(0);

                    const rewardAmount = rewardRate * (elapsedBlocks + 1);

          expect(await rewardVesting.userBalances(await depositor.getAddress())).equal(0);
          expect(await newRewardVesting.userBalances(await depositor.getAddress())).gte(rewardAmount - EPSILON)
          .lte(rewardAmount);

        });
      });
    });

    context("with multiple deposits", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.claim(0);
      });

      it("mints reward tokens", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 2);

        expect(await rewardVesting.userBalances(await depositor.getAddress()))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });

      it("clears unclaimed amount", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);
      });
    });
  });

  describe("exit", () => {
    let depositor: Signer;
    let token: MockCOOK;

    let rewardWeight = 1;
    let depositAmount = 50000;
    let rewardRate = 1000;

    beforeEach(async () => {
      [depositor, ...signers] = signers;

      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;
    });

    beforeEach(async () => (token = token.connect(depositor)));

    beforeEach(async () => {
      await token.mint(await depositor.getAddress(), MAXIMUM_U256);
      await token.approve(pools.address, MAXIMUM_U256);
    });

    beforeEach(async () => (pools = pools.connect(governance)));

    beforeEach(async () => {
      await pools.createPool(token.address,true);
      await pools.setRewardWeights([rewardWeight]);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 1000;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.exit(0);
      });

      it("mints reward tokens", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + 1);

        expect(await rewardVesting.userBalances(await depositor.getAddress())).gte(rewardAmount - EPSILON)
        .lte(rewardAmount);
      });

      it("clears unclaimed amount", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);
      });

      it("withdraws all the deposits", async () => {
        expect(await pools.getStakeTotalDeposited(await depositor.getAddress(), 0)).equal(0);
      });

      context("when in pause mode", () => {
        beforeEach(async () => {
          await pools.connect(governance).setPause(true);
          pools = pools.connect(depositor)
          await pools.deposit(0, depositAmount);
          await mineBlocks(ethers.provider, elapsedBlocks);
        });

        it("only allow exit when not in pause mode", async () => {
          expect(pools.exit(0)).revertedWith(
            "StakingPools: emergency pause enabled"
          );
        });
      });
    });

    context("with multiple deposits", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.exit(0);
      });

      it("mints reward tokens", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 2);

        expect(await rewardVesting.userBalances(await depositor.getAddress()))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });

      it("clears unclaimed amount", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);
      });

      it("withdraws all the deposits", async () => {
        expect(await pools.getStakeTotalDeposited(await depositor.getAddress(), 0)).equal(0);
      });
    });
  });


  describe("claim tokens without vesting", () => {
    let depositor: Signer;
    let token: MockCOOK;

    let rewardWeight = 1;
    let depositAmount = 50000;
    let rewardRate = 1000;

    beforeEach(async () => {
      [depositor, ...signers] = signers;

      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;
    });

    beforeEach(async () => (token = token.connect(depositor)));

    beforeEach(async () => {
      await token.mint(await depositor.getAddress(), MAXIMUM_U256);
      await token.approve(pools.address, MAXIMUM_U256);
    });

    beforeEach(async () => (pools = pools.connect(governance)));

    beforeEach(async () => {
      await pools.createPool(token.address,false);
      await pools.setRewardWeights([rewardWeight]);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 1000;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.claim(0);
      });

      it("mints reward tokens", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + 1);

        expect(await reward.balanceOf(await depositor.getAddress()))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });

      it("clears unclaimed amount", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);
      });
    });

    context("with multiple deposits", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.claim(0);
      });

      it("mints reward tokens", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 2);

        expect(await reward.balanceOf(await depositor.getAddress()))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });

      it("clears unclaimed amount", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);
      });
    });
  });

  describe("get stake unclaimed amount", () => {
    let depositor: Signer;
    let token: MockCOOK;

    let rewardWeight = 1;
    let depositAmount = 50000;
    let rewardRate = 5000;

    beforeEach(async () => {
      [depositor, ...signers] = signers;

      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;
    });

    beforeEach(async () => (token = token.connect(depositor)));

    beforeEach(async () => {
      await token.mint(await depositor.getAddress(), MAXIMUM_U256);
      await token.approve(pools.address, MAXIMUM_U256);
    });

    beforeEach(async () => (pools = pools.connect(governance)));

    beforeEach(async () => {
      await pools.createPool(token.address,true);
      await pools.setRewardWeights([rewardWeight]);
      await pools.setRewardRate(rewardRate);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => (pools = pools.connect(depositor)));

      beforeEach(async () => await pools.deposit(0, depositAmount));

      beforeEach(async () => {
        await mineBlocks(ethers.provider, elapsedBlocks);
      });

      it("properly calculates the balance", async () => {
        const rewardAmount = rewardRate * elapsedBlocks;

        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(rewardAmount);
      });
    });

    context("with multiple deposits", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => (pools = pools.connect(depositor)));

      beforeEach(async () => {
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
      });

      it("properly calculates the balance", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 1);

        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });
    });
  });

  describe("get stake accumulated power", () => {
    let depositor: Signer;
    let player: Signer;
    let token: MockCOOK;

    let rewardWeight = 1;
    let depositAmount = 50000;
    let rewardRate = 5000;

    beforeEach(async () => {
      [depositor,player, ...signers] = signers;

      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;
    });

    beforeEach(async () => {
      await token.connect(depositor).mint(await depositor.getAddress(), 100000000000);
      await token.connect(depositor).approve(pools.address, MAXIMUM_U256);

      await token.connect(player).mint(await player.getAddress(), 100000000000);
      await token.connect(player).approve(pools.address, MAXIMUM_U256);
    });

    beforeEach(async () => (pools = pools.connect(governance)));

    beforeEach(async () => {
      await pools.createPool(token.address,true);
      await pools.setRewardWeights([rewardWeight]);
      await pools.setRewardRate(rewardRate);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;


      it("properly calculates the power", async () => {
        await pools.connect(depositor).deposit(0, depositAmount);
        await mineBlocks(ethers.provider, 10);
        await pools.connect(player).deposit(0, depositAmount);
        await mineBlocks(ethers.provider, 10);

        const rewardAmount = rewardRate * 10;

        expect(await pools.getAccumulatedPower(await depositor.getAddress(), 0)).equal(80000);
        expect(await pools.getAccumulatedPower(await player.getAddress(), 0)).equal(25000);
      });

      it("properly calculates the power after someone claim and withdraw", async () => {
        await pools.connect(depositor).deposit(0, depositAmount);
        await mineBlocks(ethers.provider, 10);
        await pools.connect(player).deposit(0, depositAmount);
        await mineBlocks(ethers.provider, 10);
        expect(await pools.getAccumulatedPower(await depositor.getAddress(), 0)).equal(80000);
        expect(await pools.getAccumulatedPower(await player.getAddress(), 0)).equal(25000);

        await pools.connect(player).claim(0);

        expect(await pools.getAccumulatedPower(await depositor.getAddress(), 0)).equal(82500);
        expect(await pools.getAccumulatedPower(await player.getAddress(), 0)).equal(27500);

        await pools.connect(depositor).withdraw(0,37500); // 85000, 30000

        expect(await pools.getAccumulatedPower(await depositor.getAddress(), 0)).equal(85000);
        expect(await pools.getAccumulatedPower(await player.getAddress(), 0)).equal(30000);

        await mineBlocks(ethers.provider, 10);

        expect(await pools.getAccumulatedPower(await depositor.getAddress(), 0)).equal(95000);
        expect(await pools.getAccumulatedPower(await player.getAddress(), 0)).equal(70000);


        expect(await pools.nextUser(0)).equal(2);
        expect(await pools.getPoolUser(0,0)).equal(await depositor.getAddress());
        expect(await pools.getPoolUser(0,1)).equal(await player.getAddress());

      });
    });

    // context("with multiple deposits", () => {
    //   const EPSILON: number = 5;
    //
    //   let elapsedBlocks = 100;
    //
    //   beforeEach(async () => (pools = pools.connect(depositor)));
    //
    //   beforeEach(async () => {
    //     await pools.deposit(0, depositAmount);
    //     await mineBlocks(ethers.provider, elapsedBlocks);
    //     await pools.deposit(0, depositAmount);
    //     await mineBlocks(ethers.provider, elapsedBlocks);
    //   });
    //
    //   it("properly calculates the balance", async () => {
    //     const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 1);
    //
    //     expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0))
    //       .gte(rewardAmount - EPSILON)
    //       .lte(rewardAmount);
    //   });
    // });
  });
});
