import { useRef, useState } from 'react'

/*
  CopyButton — copies the given text to the user's clipboard.

  - Shows the word "نسخ" by default. On success, flashes "✓ تم" in green
    for ~1.5s then reverts.
  - Never mutates the text. If the caller passes a clean name (without any
    decoration like flags), that's exactly what ends up on the clipboard.
  - Uses the modern clipboard API with a textarea fallback for older
    browsers and non-secure contexts.
  - stopPropagation on click so embedding this inside a clickable row
    (e.g. a customer card) doesn't also trigger the card's handler.
*/
export default function CopyButton({
  text,
  className = '',
  ariaLabel,
  idleLabel = 'نسخ',
  successLabel = '✓ تم',
  title,
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef(null)

  async function handleClick(event) {
    event.preventDefault()
    event.stopPropagation()

    const value = String(text ?? '').trim()
    if (!value) return

    let success = false
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        success = true
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.top = '-1000px'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        try {
          success = document.execCommand('copy')
        } finally {
          document.body.removeChild(textarea)
        }
      }
    } catch {
      success = false
    }

    if (!success) return

    setCopied(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' copy-btn--success' : ''} ${className}`.trim()}
      onClick={handleClick}
      title={title || (copied ? 'تم النسخ' : `نسخ "${text}"`)}
      aria-label={ariaLabel || `نسخ ${text}`}
    >
      {copied ? successLabel : idleLabel}
    </button>
  )
}
