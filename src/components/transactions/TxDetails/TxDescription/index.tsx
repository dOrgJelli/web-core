import { type ReactElement } from 'react'

const TxDescription = ({ txDescription }: { txDescription: string }): ReactElement => {
  const boldSections = txDescription.split('**')

  return (
    <div>
      {boldSections.map((section, index) =>
        index % 2 ? (
          <span key={index}>
            <b>{section}</b>
          </span>
        ) : (
          <span key={index}>{section}</span>
        ),
      )}
    </div>
  )
}

export default TxDescription
