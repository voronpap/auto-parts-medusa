export const PartIcon = ({ title }: { title: string }) => {
  const name = title.toLowerCase()

  if (name.includes("фільтр")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M8 3h8v5l2 3v10H6V11l2-3z" />
        <path d="M8 8h8M9 13h6M9 17h6" />
      </svg>
    )
  }

  if (name.includes("амортизатор")) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M7 3v4l3 2-3 2 3 2-3 2 3 2-3 2v2M17 3v18" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="m12 4 2 5m6 3-5 2m-3 6-2-5m-6-3 5-2" />
    </svg>
  )
}
