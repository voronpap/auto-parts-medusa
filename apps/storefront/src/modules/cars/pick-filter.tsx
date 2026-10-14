"use client"

import { useEffect, useState } from "react"

// On a phone a long list starts folded to this many entries.
const FOLDED = 16
const PHONE = "(max-width: 520px)"

/**
 * Narrows the list of makes or models below it as the shopper types. On a
 * phone the full list starts folded, so the page does not run on for
 * thousands of pixels; "show all" or typing opens it.
 */
export default function PickFilter({ target, placeholder }: { target: string; placeholder: string }) {
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [total, setTotal] = useState(0)
  const [phone, setPhone] = useState(false)

  useEffect(() => {
    setPhone(window.matchMedia(PHONE).matches)
    setTotal(document.querySelectorAll(`#${target} a`).length)
  }, [target])

  useEffect(() => {
    const wanted = text.trim().toLowerCase()
    const folded = phone && !open && !wanted

    document.querySelectorAll<HTMLElement>(`#${target} a`).forEach((link, index) => {
      const name = link.querySelector("strong")?.textContent?.toLowerCase() ?? ""
      const shown = wanted ? name.includes(wanted) : !folded || index < FOLDED
      link.style.display = shown ? "" : "none"
    })
  }, [text, open, phone, target])

  return (
    <>
      <div className="ap-pick-filter">
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>
      {phone && !open && !text.trim() && total > FOLDED && (
        <button type="button" className="ap-pick-more" onClick={() => setOpen(true)}>
          Показати всі ({total})
        </button>
      )}
    </>
  )
}
