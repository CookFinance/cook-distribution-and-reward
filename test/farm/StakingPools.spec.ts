import chai from "chai";
import {solidity} from "ethereum-waffle";
import {ethers} from "hardhat";
import {BigNumber, BigNumberish, ContractFactory, Signer} from "ethers";

import {StakingPools} from "../../typechain/StakingPools";
import { RewardVesting } from "../../typechain/RewardVesting";
import { MockCOOK } from "../../typechain/MockCOOk";
import {MAXIMUM_U256, mineBlocks, ZERO_ADDRESS} from "../utils/helper";
import { isRegExp } from "util";

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

    pools = (await StakingPoolsFactory.connect(deployer).deploy(
      reward.address,
      await governance.getAddress(),
      await sentinel.getAddress(),
      rewardVesting.address
    )) as StakingPools;

     await rewardVesting.connect(governance).initialize(reward.address, pools.address);
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
      await newRewardVesting.connect(governance).initialize(reward.address, pools.address);

      expect(pools.setRewardVesting(newRewardVesting.address)).revertedWith(
        "StakingPools: not paused, or not governance or sentinel"
      );
      expect(await pools.rewardVesting()).equal(rewardVesting.address);
    });

    context("when caller is governance", () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("only allows in the pause mode", async () => {
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address, pools.address);
  
        expect(pools.setRewardVesting(newRewardVesting.address)).revertedWith(
          "StakingPools: not paused, or not governance or sentinel"
        );
        expect(await pools.rewardVesting()).equal(rewardVesting.address);
      });

      it("set reward vesting to new contract", async () => {
        await pools.connect(governance).setPause(true);
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address, pools.address);

        await pools.setRewardVesting(newRewardVesting.address);
        expect(await pools.rewardVesting()).equal(newRewardVesting.address);
      });

      it("emits RewardVestingUpdated event", async () => {
        await pools.connect(governance).setPause(true);
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address, pools.address);

        expect(pools.setRewardVesting(newRewardVesting.address))
          .emit(pools, "RewardVestingUpdated")
          .withArgs(newRewardVesting.address);
      });
    });

    context("when caller is sentinel", () => {
      beforeEach(async () => (pools = pools.connect(sentinel)));

      it("only allows in the pause mode", async () => {
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address, pools.address);
  
        expect(pools.setRewardVesting(newRewardVesting.address)).revertedWith(
          "StakingPools: not paused, or not governance or sentinel"
        );
        expect(await pools.rewardVesting()).equal(rewardVesting.address);
      });

      it("set reward vesting to new contract", async () => {
        await pools.connect(governance).setPause(true);
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address, pools.address);

        await pools.setRewardVesting(newRewardVesting.address);
        expect(await pools.rewardVesting()).equal(newRewardVesting.address);
      });

      it("emits RewardVestingUpdated event", async () => {
        await pools.connect(governance).setPause(true);
        let newRewardVesting = (await RewardVestingFactory.connect(deployer).deploy(await governance.getAddress())) as RewardVesting;
        await newRewardVesting.connect(governance).initialize(reward.address, pools.address);

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
      expect(pools.createPool(token.address,true, 300)).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", async () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("emits PoolCreated event", async () => {
        expect(pools.createPool(token.address,true, 300))
          .emit(pools, "PoolCreated")
          .withArgs(0, token.address);
      });

      context("when reusing token", async () => {
        it("reverts", async () => {
          await pools.createPool(token.address,true,300);
          expect(pools.createPool(token.address,true,300)).revertedWith("StakingPools: token already has a pool");
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
          await pools.connect(governance).createPool(token.address,true,300);
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
              .createPool(tokens[n].address,true,300);
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
      await pools.connect(governance).createPool(token.address,true,300);
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
        0x121863db810cdafe1b431bccb20074bccccb6c3c;
        await token.approve(pools.address, amount);
        await pools.deposit(poolId, amount, ZERO_ADDRESS);
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
        await pools.deposit(0, initialDepositAmount, ZERO_ADDRESS);
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

      await pools.connect(governance).createPool(token.address,true,300);
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
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
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
      await pools.createPool(token.address,true,300);
      await pools.setRewardWeights([rewardWeight]);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 1000;

      context("when in pause mode", () => {
        beforeEach(async () => {
          await pools.connect(governance).setPause(true);
          pools = pools.connect(depositor)
          await pools.deposit(0, depositAmount, ZERO_ADDRESS);
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
          await pools.deposit(0, depositAmount, ZERO_ADDRESS);
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
          await newRewardVesting.connect(governance).initialize(reward.address, pools.address);
          await pools.setRewardVesting(newRewardVesting.address);
          await pools.connect(governance).setPause(false);

          pools = pools.connect(depositor);
          await pools.deposit(0, depositAmount, ZERO_ADDRESS);
          await mineBlocks(ethers.provider, elapsedBlocks);
          await pools.claim(0);

          expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);

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
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.connect(governance).startReferralBonus(0)
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.claim(0);
      });

      it("mints reward tokens", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 3);

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
      await pools.createPool(token.address,true,300);
      await pools.setRewardWeights([rewardWeight]);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 1000;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
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
          await pools.deposit(0, depositAmount, ZERO_ADDRESS);
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
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
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
      await pools.createPool(token.address,false,0);
      await pools.setRewardWeights([rewardWeight]);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 1000;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
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
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
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
      await pools.createPool(token.address,true,300);
      await pools.setRewardWeights([rewardWeight]);
      await pools.setRewardRate(rewardRate);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => (pools = pools.connect(depositor)));

      beforeEach(async () => await pools.deposit(0, depositAmount, ZERO_ADDRESS));

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
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.connect(governance).startReferralBonus(0);
        await pools.deposit(0, depositAmount, ZERO_ADDRESS);
        await mineBlocks(ethers.provider, elapsedBlocks);
      });

      it("properly calculates the balance", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 2);

        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });
    });
  });

  describe("referral program", () => {
    let depositor1: Signer;
    let depositor2: Signer;
    let referral1: Signer;
    let referral2: Signer;
    let referral3: Signer;
    let token: MockCOOK;

    let rewardWeight = 1;
    let depositAmount = 50000;
    let rewardRate = 5000;

    const EPSILON: number = 5;

    beforeEach(async () => {
      [depositor1, depositor2, referral1, referral2, referral3, ...signers] = signers;

      token = (await MockCOOKFactory.connect(deployer).deploy(
        "1000000000000000000"
      )) as MockCOOK;
    });

    beforeEach(async () => {
      await token.connect(depositor1).mint(await depositor1.getAddress(), 10000000000000);
      await token.connect(depositor2).mint(await depositor2.getAddress(), 10000000000000);

      await token.connect(depositor1).approve(pools.address, MAXIMUM_U256);
      await token.connect(depositor2).approve(pools.address, MAXIMUM_U256);
    });

    beforeEach(async () => (pools = pools.connect(governance)));

    beforeEach(async () => {
      await pools.createPool(token.address,true,300);
      await pools.setRewardWeights([rewardWeight]);
      await pools.setRewardRate(rewardRate);
    });

    context("referee can not use different referral", () => {
      let elapsedBlocks = 100;
      beforeEach(async () => (pools = pools.connect(depositor1)));

      it("referral can be anything before turned on", async () => {
        await pools.deposit(0, depositAmount, await referral1.getAddress());
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount, await referral2.getAddress());
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount, await depositor2.getAddress());
        await mineBlocks(ethers.provider, elapsedBlocks);

        const expectedReward = rewardRate * (elapsedBlocks * 3 + 2)
        expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(expectedReward - EPSILON).lte(expectedReward + EPSILON);
      });

      it("referee can not use different referral during competition", async () => {
        await pools.connect(governance).startReferralBonus(0);
        await pools.deposit(0, depositAmount, await referral1.getAddress());
        await mineBlocks(ethers.provider, elapsedBlocks);

        expect(pools.deposit(0, depositAmount, await referral2.getAddress())).revertedWith("referred already");
      });

      it("referee can use the same referral address all the time during referral competition", async () => {
        await pools.connect(governance).startReferralBonus(0);
        for (var i = 0; i < 3; i++) {
          await pools.deposit(0, depositAmount, await referral1.getAddress());
          await mineBlocks(ethers.provider, elapsedBlocks);
        }
        
        const expectedReward = rewardRate * (elapsedBlocks * 3 + 2)
        expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(expectedReward - EPSILON).lte(expectedReward + EPSILON);
        expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(expectedReward - EPSILON).lte(expectedReward + EPSILON);
      })

      it("referral can by anthing after referral competition tured off", async() => {
        await pools.connect(governance).startReferralBonus(0);
        await pools.deposit(0, depositAmount, await referral1.getAddress());
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.connect(governance).stoptReferralBonus(0);
        await pools.deposit(0, depositAmount, await referral2.getAddress());
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount, await depositor2.getAddress());
        await mineBlocks(ethers.provider, elapsedBlocks);

        const expectedReward = rewardRate * (elapsedBlocks * 3 + 3);
        expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(expectedReward - EPSILON).lte(expectedReward + EPSILON);
      });

      it("My referee should be correct", async() => {
          await pools.connect(depositor1).deposit(0, depositAmount, await referral1.getAddress());
          await pools.connect(depositor2).deposit(0, depositAmount, await referral2.getAddress());
          var refferree1 = await pools.getPoolreferee(0, await referral1.getAddress())
          var refferree2 = await pools.getPoolreferee(0, await referral2.getAddress())
          expect(refferree1.length).equal(0);
          expect(refferree2.length).equal(0);

          await pools.connect(governance).startReferralBonus(0);

          await pools.connect(depositor1).deposit(0, depositAmount, await referral1.getAddress());
          await pools.connect(depositor2).deposit(0, depositAmount, await referral2.getAddress());
          refferree1 = await pools.getPoolreferee(0, await referral1.getAddress())
          refferree2 = await pools.getPoolreferee(0, await referral2.getAddress())
          expect(refferree1.length).equal(1);
          expect(refferree2.length).equal(1);

          await pools.connect(depositor1).deposit(0, depositAmount, ZERO_ADDRESS);
          await pools.connect(depositor2).deposit(0, depositAmount, ZERO_ADDRESS);
          refferree1 = await pools.getPoolreferee(0, await referral1.getAddress())
          refferree2 = await pools.getPoolreferee(0, await referral2.getAddress())
          expect(refferree1.length).equal(1);
          expect(refferree1[0]).equals(await depositor1.getAddress());
          expect(refferree2[0]).equals(await depositor2.getAddress());
      });

      it("Multitple referee with same referral", async() => {
          await pools.connect(governance).startReferralBonus(0);

          await pools.connect(depositor1).deposit(0, depositAmount, await referral1.getAddress());
          var refferree1 = await pools.getPoolreferee(0, await referral1.getAddress())
          expect(refferree1.length).equal(1);

          await pools.connect(depositor2).deposit(0, depositAmount, await referral1.getAddress());
          refferree1 = await pools.getPoolreferee(0, await referral1.getAddress())
          expect(refferree1.length).equal(2);
          expect(refferree1[0]).equals(await depositor1.getAddress());
          expect(refferree1[1]).equals(await depositor2.getAddress());
      })


    });

    context("Referral power should be calculated based on status of referral competition", () => {
      let elapsedBlocks = 100;
      beforeEach(async () => (pools = pools.connect(depositor1)));
      
      it("should be zero before turned on", async () => {
        await pools.deposit(0, depositAmount, await referral1.getAddress());
        expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).equal(0);
        expect(await pools.getPoolTotalReferralAmount(0)).equal(0);

        await mineBlocks(ethers.provider, elapsedBlocks);
        expect(await pools.getPoolTotalReferralAmount(0)).equal(0);
        expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).equal(0);
      }) 

      it("should get correct referral power after competition turned on", async () => {
        expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).equal(0);
        expect(await pools.getPoolTotalReferralAmount(0)).equal(0);
        expect(await pools.nextReferral(0)).equal(0);
        
        await pools.deposit(0, depositAmount, await referral1.getAddress());
        await mineBlocks(ethers.provider, elapsedBlocks);

        await pools.connect(governance).startReferralBonus(0);
        await pools.deposit(0, depositAmount, await referral1.getAddress());
        
        await mineBlocks(ethers.provider, elapsedBlocks);
        const expectedDepositReward = rewardRate * (elapsedBlocks + elapsedBlocks + 2);
        const expectedReferralPower = rewardRate * elapsedBlocks

        expect(await pools.nextReferral(0)).equal(1);
        expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(expectedDepositReward - EPSILON).lte(expectedDepositReward + EPSILON);
        expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(expectedReferralPower - EPSILON).lte(expectedReferralPower + EPSILON);
        expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount);
      });

      it("Stop distributing referral power once competition turned off", async () => {
        await pools.connect(governance).startReferralBonus(0);
        await pools.deposit(0, depositAmount, await referral1.getAddress());

        await mineBlocks(ethers.provider, elapsedBlocks);
        const expectedDepositReward = rewardRate * elapsedBlocks;
        const expectedReferralPower = rewardRate * elapsedBlocks
        expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(expectedDepositReward - EPSILON).lte(expectedDepositReward + EPSILON);
        expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(expectedDepositReward - EPSILON).lte(expectedDepositReward + EPSILON);
        expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount);
        expect(await pools.nextReferral(0)).equal(1);

        await pools.connect(governance).stoptReferralBonus(0);
        await pools.deposit(0, depositAmount, await referral2.getAddress());
        
        await mineBlocks(ethers.provider, elapsedBlocks);
        const nextExpectedDepositReward = rewardRate * (elapsedBlocks + elapsedBlocks + 2)
        expect(await pools.nextReferral(0)).equal(1);
        expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(nextExpectedDepositReward - EPSILON).lte(nextExpectedDepositReward + EPSILON);
        expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).equal(expectedReferralPower);
        expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount);
      });
    });

    context("referral should get correct accumulated referral power", () => {
      let elapsedBlocks = 100;
      beforeEach(async () => (pools = pools.connect(depositor1)));

      it("once referred, referral power should calcuated even address is not given", async() => {
          await pools.connect(governance).startReferralBonus(0);
          await pools.deposit(0, depositAmount, await referral1.getAddress());
          await mineBlocks(ethers.provider, elapsedBlocks);

          await pools.deposit(0, depositAmount, await ZERO_ADDRESS);
          await mineBlocks(ethers.provider, elapsedBlocks);

          await pools.deposit(0, depositAmount, await ZERO_ADDRESS);
          await mineBlocks(ethers.provider, elapsedBlocks);

          const expectedDepositReward = rewardRate * (elapsedBlocks * 3 + 2)
          const expectedReferralPower = rewardRate * (elapsedBlocks * 3 + 2);
          expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(expectedDepositReward - EPSILON).lte(expectedDepositReward + EPSILON);
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(expectedReferralPower - EPSILON).lte(expectedDepositReward + EPSILON);
          expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount * 3);        
      });

      it("properly calculates the power after someone claim and withdraw with referral", async() => {
          await pools.connect(governance).startReferralBonus(0);
          await pools.deposit(0, depositAmount, await referral1.getAddress());
          await mineBlocks(ethers.provider, elapsedBlocks);
          await pools.deposit(0, depositAmount, await ZERO_ADDRESS);
          await mineBlocks(ethers.provider, elapsedBlocks);

          const expectedReferralPower = rewardRate * (elapsedBlocks * 2 + 1);
          const expectedReward = rewardRate * (elapsedBlocks * 2 + 1);
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(expectedReferralPower - EPSILON).lte((expectedReferralPower + EPSILON));
          expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(expectedReward - EPSILON).lte((expectedReward + EPSILON));

          // claim should not affect referral power accumulation
          await pools.claim(0);
          const next1ExpectedReferralPower = expectedReferralPower + rewardRate * 1;
          expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).equal(0);
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(next1ExpectedReferralPower - EPSILON).lte((next1ExpectedReferralPower + EPSILON));

          await mineBlocks(ethers.provider, elapsedBlocks * 2);
          const next2ExpectedReferralPower = next1ExpectedReferralPower + rewardRate * elapsedBlocks * 2;
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(next2ExpectedReferralPower - EPSILON).lte((next2ExpectedReferralPower + EPSILON));
          const next2ExpectedReward = rewardRate * elapsedBlocks * 2;
          expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).gte(next2ExpectedReward - EPSILON).lte(next2ExpectedReward + EPSILON)

          // Exit/withdraw should stop referral power accumulation contributed from referee
          await pools.exit(0)
          const next3ExpectedReferralPower = next2ExpectedReferralPower + rewardRate * 1;
          await mineBlocks(ethers.provider, elapsedBlocks * 4);
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(next3ExpectedReferralPower - EPSILON).lte((next3ExpectedReferralPower + EPSILON));
          expect(await pools.getStakeTotalUnclaimed(await depositor1.getAddress(), 0)).equal(0);
      });

      it("properly calculates the power after someone claim and withdraw with more players", async() => {
          await pools.connect(governance).startReferralBonus(0);
          await pools.connect(depositor1).deposit(0, depositAmount, await referral1.getAddress());
          await mineBlocks(ethers.provider, elapsedBlocks);

          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(rewardRate * elapsedBlocks - EPSILON).lte(rewardRate * elapsedBlocks + EPSILON);
          expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount);  

          await pools.connect(depositor2).deposit(0, depositAmount, await referral2.getAddress());
          await mineBlocks(ethers.provider, elapsedBlocks * 2);

          const referral1Power = rewardRate * (elapsedBlocks + 1 + elapsedBlocks * 2 / 2)
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(referral1Power - EPSILON).lte(referral1Power + EPSILON);
          const referral2Power = rewardRate * (elapsedBlocks * 2 / 2)
          expect(await pools.getAccumulatedReferralPower(await referral2.getAddress(), 0)).gte(referral2Power - EPSILON).lte(referral2Power + EPSILON);
          expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount * 2);  

          await pools.connect(depositor2).deposit(0, depositAmount * 2, await referral2.getAddress());
          await mineBlocks(ethers.provider, elapsedBlocks * 2);
          const next1Referral1Power = referral1Power + rewardRate * (0.5 + elapsedBlocks * 2 * 1 / 4);
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(next1Referral1Power - rewardRate).lte(next1Referral1Power + rewardRate);
          const next1Referral2Power = referral2Power + rewardRate * (0.5 + elapsedBlocks * 2 * 3 / 4);
          expect(await pools.getAccumulatedReferralPower(await referral2.getAddress(), 0)).gte(next1Referral2Power - rewardRate).lte(next1Referral2Power + rewardRate);
          expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount * 4);  

          await pools.connect(depositor2).withdraw(0, depositAmount * 2);
          await mineBlocks(ethers.provider, elapsedBlocks * 2);

          const next2Referral1Power = next1Referral1Power + rewardRate * (0.25 + elapsedBlocks * 2 / 2)
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(next2Referral1Power - rewardRate).lte(next2Referral1Power + rewardRate);
          const next2Referral2Power = next1Referral2Power + rewardRate * (0.75 + elapsedBlocks * 2 / 2);
          expect(await pools.getAccumulatedReferralPower(await referral1.getAddress(), 0)).gte(next2Referral2Power - rewardRate).lte(next2Referral2Power + rewardRate);
          expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount * 2);  
      });

      it("One referral has multiple referees", async() => {
          await pools.connect(governance).startReferralBonus(0);
          await pools.deposit(0, depositAmount, await referral3.getAddress());
          await mineBlocks(ethers.provider, elapsedBlocks);

          const referralPower = rewardRate * elapsedBlocks;
          expect(await pools.getAccumulatedReferralPower(await referral3.getAddress(), 0)).gte(referralPower - EPSILON).lte(referralPower + EPSILON);
          expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount);  

          await pools.connect(depositor2).deposit(0, depositAmount, await referral3.getAddress());
          await mineBlocks(ethers.provider, elapsedBlocks * 2);
          
          const nextReferralPower = referralPower + rewardRate * (elapsedBlocks * 2 + 1)
          expect(await pools.getAccumulatedReferralPower(await referral3.getAddress(), 0)).gte(nextReferralPower - EPSILON).lte(nextReferralPower + EPSILON);
          expect(await pools.getPoolTotalReferralAmount(0)).equal(depositAmount * 2);  
      });
    });
  });
});
