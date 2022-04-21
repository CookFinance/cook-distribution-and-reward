import { ethers, network,  } from "hardhat";
import { BigNumber } from "ethers";

import { StakingPoolABI } from "../constant";
import moment from "moment";
const ether = (amount: number | string): BigNumber => {
  const weiString = ethers.utils.parseEther(amount.toString());
  return BigNumber.from(weiString);
};
const AVA_STAKINGPOOLS_ADDRESS = "0x35bE7982bC5E40A8C9aF39A639bDDcE32081102e";
const IndexPriceMap: any = {
    "0x6f4a6a855412635668d9ebc69977870a637882ce": 186.332,
    "0xd3b4a602df2a3abdc0ca241674bcd7566aba4d93": 43.605,
    "0x1967514beb1464857b54aa3e6cbe4fc7d245fa40": 1.03,
    "0x57c12dbecc15582e72d5cc7cf474bd1d11a79198": 68.512,
    "0x803c2bb998eb9952a17231ce075523887836e9ff": 1.053,
    "0x41141bfd95a1f747a0cc08bf2567481c83f5fdc2": 1.051,
    "0x4ce8ab2e657f76fe54f45e323fcb6c5045fd7b27": 77.664,
    "0x48a83ebd0b3de9ecd7bcad3abf867dcb594d10a4": 79.681,
    "0x8875553c3e5afa70e61e6f153ee713e4a8409661": 81.397,
    "0xeb09608205c6f3f0c601a8039f147b6712126a72": 78.74
}
const CookPrice = 0.00208916;
async function calcReferralReward() {
    const stakingPools = await ethers.getContractAt(StakingPoolABI, AVA_STAKINGPOOLS_ADDRESS)
    const poolCount = await stakingPools.poolCount();
    const startDate = moment().startOf("month").format("YYYY-MM-DD")
    const endDate = moment().endOf("month").format("YYYY-MM-DD")
    let referralAccounts = [];
    for(let i = 0, l = poolCount; i < l; i++) {
        const poolId = i;
        const nextReferral = await stakingPools.nextReferral(poolId)
        if (nextReferral > 0) {
           for (let userIndex = 0; userIndex < nextReferral; userIndex++) {
               const referral  = await stakingPools.getPoolReferral(poolId, userIndex);
               referralAccounts.push(referral)
             //  console.log(poolId, referral)
           }
        }
     }
     const rewardList = []
     for(let m = 0, n = referralAccounts.length; m < n; m++) {
       const account = referralAccounts[m]
       let accountTotalTvl = 0;
       for(let i = 0, l = poolCount; i < l; i++) {
           const referees = await stakingPools.getPoolreferee(i, account)
           let totalStakedTVL  = 0;
           const poolToken = await stakingPools.getPoolToken(i);
           if (IndexPriceMap[poolToken.toLowerCase()]) {
           // console.log(poolToken);
            for(let refereesIndex = 0, refereesCount = referees.length; refereesIndex < refereesCount; refereesIndex++) {
               const userDeposits = await stakingPools.getUserDeposits(i, referees[refereesIndex])
             //   console.log({
             //     userDeposits
             //   })
               for(let i = 0, l = userDeposits.length; i < l; i++) {
                 const userDeposit = userDeposits[i]
                 const timestamp = userDeposit.timestamp;
                 const time = moment(new Date(timestamp * 1000));
                 if (moment(time).isBetween(moment(startDate), moment(endDate))) {  
                     const amount = parseFloat(ethers.utils.formatEther(userDeposit.amount))
                     const price =  IndexPriceMap[poolToken.toLowerCase()];
                     console.log(amount, price);
                    totalStakedTVL = totalStakedTVL +  amount * price
                   //console.log(time, totalStakedAmont)
                 }
               }
             }
           }
           accountTotalTvl = accountTotalTvl + totalStakedTVL
       }
       rewardList.push({
           account: account,
           amount: (accountTotalTvl * 0.01) / CookPrice
       })
     }
     console.log(rewardList)
}
async function main() {
 // await startReferralBonus()
  await calcReferralReward()


  
    //referralAccounts = 
 
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });