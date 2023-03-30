import React, { type ReactElement } from 'react'
import type { TransactionDetails, TransactionSummary } from '@safe-global/safe-gateway-typescript-sdk'
import { getTransactionDetails, Operation } from '@safe-global/safe-gateway-typescript-sdk'
import { Box, CircularProgress } from '@mui/material'
import { PolywrapClient } from '@polywrap/client-js'

import TxSigners from '@/components/transactions/TxSigners'
import Summary from '@/components/transactions/TxDetails/Summary'
import TxDescription from '@/components/transactions/TxDetails/TxDescription'
import TxData from '@/components/transactions/TxDetails/TxData'
import useChainId from '@/hooks/useChainId'
import useAsync from '@/hooks/useAsync'
import {
  isAwaitingExecution,
  isModuleExecutionInfo,
  isMultiSendTxInfo,
  isMultisigDetailedExecutionInfo,
  isMultisigExecutionInfo,
  isSupportedMultiSendAddress,
  isTxQueued,
} from '@/utils/transaction-guards'
import { InfoDetails } from '@/components/transactions/InfoDetails'
import EthHashInfo from '@/components/common/EthHashInfo'
import css from './styles.module.css'
import ErrorMessage from '@/components/tx/ErrorMessage'
import TxShareLink from '../TxShareLink'
import { ErrorBoundary } from '@sentry/react'
import ExecuteTxButton from '@/components/transactions/ExecuteTxButton'
import SignTxButton from '@/components/transactions/SignTxButton'
import RejectTxButton from '@/components/transactions/RejectTxButton'
import useWallet from '@/hooks/wallets/useWallet'
import useIsWrongChain from '@/hooks/useIsWrongChain'
import { DelegateCallWarning, UnsignedWarning } from '@/components/transactions/Warning'
import Multisend from '@/components/transactions/TxDetails/TxData/DecodedData/Multisend'
import useSafeInfo from '@/hooks/useSafeInfo'
import useIsPending from '@/hooks/useIsPending'

export const NOT_AVAILABLE = 'n/a'

type TxDetailsProps = {
  txSummary: TransactionSummary
  txDetails: TransactionDetails
  txDescription?: string
}

const TxDetailsBlock = ({ txSummary, txDetails, txDescription }: TxDetailsProps): ReactElement => {
  const chainId = useChainId()
  const wallet = useWallet()
  const isWrongChain = useIsWrongChain()
  const isPending = useIsPending(txSummary.id)
  const isQueue = isTxQueued(txSummary.txStatus)
  const awaitingExecution = isAwaitingExecution(txSummary.txStatus)
  const isUnsigned =
    isMultisigExecutionInfo(txSummary.executionInfo) && txSummary.executionInfo.confirmationsSubmitted === 0

  const isUntrusted =
    isMultisigDetailedExecutionInfo(txDetails.detailedExecutionInfo) &&
    txDetails.detailedExecutionInfo.trusted === false

  return (
    <>
      {/* /Details */}
      <div className={`${css.details} ${isUnsigned ? css.noSigners : ''}`}>
        <div className={css.shareLink}>
          <TxShareLink id={txSummary.id} />
        </div>

        {txDescription && (
          <div className={css.txData}>
            <ErrorBoundary fallback={<div>Error parsing data</div>}>
              <TxDescription txDescription={txDescription} />
            </ErrorBoundary>
          </div>
        )}

        <div className={css.txData}>
          <ErrorBoundary fallback={<div>Error parsing data</div>}>
            <TxData txDetails={txDetails} />
          </ErrorBoundary>
        </div>

        {/* Module information*/}
        {isModuleExecutionInfo(txSummary.executionInfo) && (
          <div className={css.txModule}>
            <InfoDetails title="Module:">
              <EthHashInfo
                address={txSummary.executionInfo.address.value}
                shortAddress={false}
                showCopyButton
                hasExplorer
              />
            </InfoDetails>
          </div>
        )}

        <div className={css.txSummary}>
          {isUntrusted && !isPending && <UnsignedWarning />}

          {txDetails.txData?.operation === Operation.DELEGATE && (
            <div className={css.delegateCall}>
              <DelegateCallWarning showWarning={!txDetails.txData.trustedDelegateCallTarget} />
            </div>
          )}
          <Summary txDetails={txDetails} />
        </div>

        {isSupportedMultiSendAddress(txDetails.txInfo, chainId) && isMultiSendTxInfo(txDetails.txInfo) && (
          <div className={`${css.multiSend}`}>
            <ErrorBoundary fallback={<div>Error parsing data</div>}>
              <Multisend txData={txDetails.txData} />
            </ErrorBoundary>
          </div>
        )}
      </div>

      {/* Signers */}
      {!isUnsigned && (
        <div className={css.txSigners}>
          <TxSigners txDetails={txDetails} txSummary={txSummary} />
          {wallet && !isWrongChain && isQueue && (
            <Box display="flex" alignItems="center" justifyContent="center" gap={1} mt={2}>
              {awaitingExecution ? <ExecuteTxButton txSummary={txSummary} /> : <SignTxButton txSummary={txSummary} />}
              <RejectTxButton txSummary={txSummary} />
            </Box>
          )}
        </div>
      )}
    </>
  )
}

// NOTE: From this line down, I've hacked-in the integration for demonstration purposes.
// This should be done in a more best-practices way in the future.
const client = new PolywrapClient()

const TxDetails = ({
  txSummary,
  txDetails,
  txDescription,
}: {
  txSummary: TransactionSummary
  txDetails?: TransactionDetails // optional
  txDescription?: string // optional
}): ReactElement => {
  const chainId = useChainId()
  const { safe } = useSafeInfo()

  const [txData, error, loading] = useAsync<{
    txDetails: TransactionDetails
    txDescription?: string
  }>(
    async (): Promise<{
      txDetails: TransactionDetails
      txDescription?: string
    }> => {
      if (txDetails) {
        return {
          txDetails,
          txDescription,
        }
      }

      return getTransactionDetails(chainId, txSummary.id).then(async (details) => {
        if (details.safeAppInfo && details.txData && details.txData.dataDecoded) {
          const appUrl = details.safeAppInfo.url
          let decoder: string | undefined = undefined

          // NOTE: this is a hack. Ideally this type of app->tx_decoder
          //       association should be apart of the safe app's metadata.
          const appDecoders = {
            'ens.domains': 'wrap://ipfs/QmQNDqGHFDfyhoWrMewq8riHsqQzCSHS4eN9cRXHww3gkM',
            // NOTE: Polywrap also supports ENS URIs, for example wrap://ens/domain.eth:text-record
            // NOTE: The source for the wrapper above currently lives here:
            // https://github.com/dorgjelli/ens-decoder
          }

          for (const appDecoder of Object.entries(appDecoders)) {
            if (appUrl.includes(appDecoder[0])) {
              decoder = appDecoder[1]
            }
          }

          if (!decoder) {
            return {
              txDetails: details,
              txDescription: undefined,
            }
          }

          let parameters = details.txData.dataDecoded.parameters?.map((p) => ({
            name: p.name,
            type: p.type,
            value: typeof p.value === 'string' ? p.value : JSON.stringify(p.value),
          }))

          // Run the decoder's custom wasm module, which returns
          // a human readable description of the transaction
          const res = await client.invoke<string>({
            uri: decoder,
            method: 'decode',
            args: {
              txData: {
                to: details.txData.to.value,
                method: details.txData.dataDecoded.method,
                parameters: parameters,
              },
            },
          })

          if (!res.ok) {
            return {
              txDetails: details,
              txDescription: undefined,
            }
          }

          console.log(res.value)

          return {
            txDetails: details,
            txDescription: res.value,
          }
        } else {
          return {
            txDetails: details,
            txDescription: undefined,
          }
        }
      })
    },
    [txDetails, chainId, txSummary.id, safe.txQueuedTag],
    false,
  )

  return (
    <div className={css.container}>
      {txData && (
        <TxDetailsBlock txSummary={txSummary} txDetails={txData.txDetails} txDescription={txData.txDescription} />
      )}
      {loading && (
        <div className={css.loading}>
          <CircularProgress />
        </div>
      )}
      {error && (
        <div className={css.error}>
          <ErrorMessage error={error}>Couldn&apos;t load the transaction details</ErrorMessage>
        </div>
      )}
    </div>
  )
}

export default TxDetails
