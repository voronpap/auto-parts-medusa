"use client"

import { useState } from "react"

/**
 * Narrows the list of makes or models below it as the shopper types, so a
 * phone does not have to scroll through every make.
 */
export default function PickFilter({ target, placeholder }: { target: string; placeholder: string }) {
  const [text, setText] = useState("")

  const filter = (value: string) => {
    setText(value)
    const wanted = value.trim().toLowerCase()

    document.querySelectorAll<HTMLElement>(`#${target} a`).forEach((link) => {
      const name = link.querySelector("strong")?.textContent?.toLowerCase() ?? ""
      link.style.display = !wanted || name.includes(wanted) ? "" : "none"
    })
  }

  return (
    <div className="ap-pick-filter">
      <input
        type="search"
        value={text}
        onChange={(event) => filter(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  )
}
