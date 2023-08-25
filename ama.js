import {
    Client,
    AccountId,
    PrivateKey,
    AccountCreateTransaction,
    AccountInfoQuery,
    TokenCreateTransaction,
    TokenMintTransaction,
    TokenAssociateTransaction,
    TransferTransaction,
    Hbar,
    TokenType,
    TokenSupplyType,
    AccountBalanceQuery,
    TokenInfoQuery,
    NftId,
    TokenNftInfoQuery
} from "@hashgraph/sdk";
import axios from "axios";

import dotenv from "dotenv";
dotenv.config();

async function main() {
    if (process.env.OPERATOR_ID == null || process.env.OPERATOR_KEY == null) {
        throw new Error(
            "Environment variables OPERATOR_ID, and OPERATOR_KEY are required."
        );
    }

    const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
    const operatorKey = PrivateKey.fromString(process.env.OPERATOR_KEY);

    const client = Client.forTestnet().setOperator(operatorId, operatorKey);

    const newKey = PrivateKey.generateED25519();

    console.log(`Private key = ${newKey.toString()}`);
    console.log(`Public key = ${newKey.publicKey.toString()}`);

    const accountCreateTx = new AccountCreateTransaction()
        .setInitialBalance(new Hbar(10))
        .setKey(newKey.publicKey)
        .freezeWith(client);

    const accountCreateResponse = await accountCreateTx.execute(client);
    const accountCreateReceipt = await accountCreateResponse.getReceipt(client);
    const newAccountId = accountCreateReceipt.accountId;
    console.log(`\nCreated account with id = ${newAccountId.toString()}`);

    const accountInfoQuery = await new AccountInfoQuery()
        .setAccountId(newAccountId)
        .execute(client);
    console.log(`Account info: ${accountInfoQuery.toString()}\n`);

    // IPFS content identifiers for the NFT metadata
    const CID = [
        "QmNPCiNA3Dsu3K5FxDPMG5Q3fZRwVTg14EXA92uqEeSRXn",
        "QmZ4dgAgt8owvnULxnKxNe8YqpavtVCXmc1Lt2XajFpJs9",
        "QmPzY5GxevjyfMUF5vEAjtyRoigzWp47MiKAtLBduLMC1T",
    ];

    const nftCreateTx = new TokenCreateTransaction()
        .setTokenName("NFT Academy Token")
        .setTokenSymbol("NFT")
        .setTokenType(TokenType.NonFungibleUnique)
        .setDecimals(0)
        .setInitialSupply(0)
        .setMaxSupply(CID.length)
        .setTreasuryAccountId(operatorId)
        .setSupplyType(TokenSupplyType.Finite)
        .setSupplyKey(operatorKey)
        .freezeWith(client);

    // Sign the transaction with the operator key
    const nftCreateTxSign = await nftCreateTx.sign(operatorKey);
    // Submit the transaction to the Hedera network
    const nftCreateSubmit = await nftCreateTxSign.execute(client);
    // Get transaction receipt information
    const nftCreateRx = await nftCreateSubmit.getReceipt(client);
    const nftTokenId = nftCreateRx.tokenId;
    console.log(`Created NFT with id: ${nftTokenId.toString()}\n`);

    const nftCollection = [];
    console.log(`Minting NFTs...`);
    for (var i = 0; i < CID.length; i++) {

        const mintTx = new TokenMintTransaction()
            .setTokenId(nftTokenId)
            .setMetadata([Buffer.from(CID)])
            .freezeWith(client);
        const mintTxSign = await mintTx.sign(operatorKey);
        const mintTxSubmit = await mintTxSign.execute(client);
        nftCollection[i] = await mintTxSubmit.getReceipt(client);

        console.log(
            `Minted NFT with serial number: ${nftCollection[
                i
            ].serials[0].toString()}`
        );
    }

    // Associate the `newAccountId` with the NFT
    const newAccountAssociateTx = new TokenAssociateTransaction()
        .setAccountId(newAccountId)
        .setTokenIds([nftTokenId])
        .freezeWith(client);

    const newAccountSignAssociateTx = await newAccountAssociateTx.sign(newKey);
    const newAccountAssociateResponse = await newAccountSignAssociateTx.execute(
        client
    );

    const newAccountAssociateReceipt = await newAccountAssociateResponse.getReceipt(
        client
    );
    
    console.log(`\nNFT associate tx status: ${newAccountAssociateReceipt.status.toString()}`);

    const firstNftId = nftCollection[0].serials[0];
    const secondNftId = nftCollection[1].serials[0];
    const thirdNftId = nftCollection[2].serials[0];

    const nftTransferTx = new TransferTransaction()
        .addNftTransfer(nftTokenId, firstNftId, operatorId, newAccountId)
        .freezeWith(client);

    // Sign the transaction with the operator key
    const nftTransferTxSign = await nftTransferTx.sign(operatorKey);

    // Submit the transaction to the Hedera network
    const nftTransferResponse = await nftTransferTxSign.execute(client);

    // Get transaction receipt information here
    const nftTransferReceipt = await nftTransferResponse.getReceipt(client);
    console.log(`NFT transfer tx status: ${nftTransferReceipt.status.toString()}\n`);

    await wait(5000);

    const link = `https://${process.env.HEDERA_NETWORK}.mirrornode.hedera.com/api/v1/accounts?account.id=${newAccountId.toString()}`;
    try {
        /* eslint-disable */
        const balance = (
            await axios.get(link)
        ).data.accounts[0].balance.tokens.find(
            (token) => token.token_id === nftTokenId.toString()
        );
        /* eslint-enable */
        console.log(`Newly created account balance of the minted NFT: ${JSON.stringify(balance)}`);
    } catch (e) {
        console.log(e);
    }

    const link2 = `https://${process.env.HEDERA_NETWORK}.mirrornode.hedera.com/api/v1/accounts?account.id=${operatorId.toString()}`;
    try {
        /* eslint-disable */
        const balance = (
            await axios.get(link2)
        ).data.accounts[0].balance.tokens.find(
            (token) => token.token_id === nftTokenId.toString()
        );
        /* eslint-enable */
        console.log(`Treasury account balance of the minted NFT: ${JSON.stringify(balance)}\n`);
    } catch (e) {
        console.log(e);
    }


    const tokenInfo = await new TokenInfoQuery()
        .setTokenId(nftTokenId)
        .execute(client);
    console.log(`Token info: ${JSON.stringify(tokenInfo)}\n`);

    const tokenNftInfo = await new TokenNftInfoQuery()
        .setNftId(new NftId(nftTokenId, firstNftId))
        .execute(client);
    console.log(`Token info for the first NFT: ${JSON.stringify(tokenNftInfo[0].toJson())}\n`);

    const tokenNftInfo2 = await new TokenNftInfoQuery()
        .setNftId(new NftId(nftTokenId, secondNftId))
        .execute(client);
    console.log(`Token info for the second NFT: ${JSON.stringify(tokenNftInfo2[0].toJson())}\n`);

    const tokenNftInfo3 = await new TokenNftInfoQuery()
        .setNftId(new NftId(nftTokenId, thirdNftId))
        .execute(client);
    console.log(`Token info for the third NFT: ${JSON.stringify(tokenNftInfo3[0].toJson())}\n`);


    console.log(`Mirror node URL for the operator: ${link2}`);
    console.log(`Mirror node URL for the newly created account: ${link}`);

    process.exit(0);
}

/**
     * @param {number} timeout
     * @returns {Promise<any>}
     */
function wait(timeout) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}

void main();
