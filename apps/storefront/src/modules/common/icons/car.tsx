import React from "react"

import { IconProps } from "types/icon"

const Car: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M3.33301 11.6667L4.79134 7.29167C5.01842 6.61042 5.65592 6.14583 6.37467 6.14583H13.6247C14.3434 6.14583 14.9809 6.61042 15.208 7.29167L16.6663 11.6667M3.33301 11.6667H16.6663M3.33301 11.6667V14.5833C3.33301 14.8135 3.51956 15 3.74967 15H5.41634C5.64646 15 5.83301 14.8135 5.83301 14.5833V13.75H14.1663V14.5833C14.1663 14.8135 14.3529 15 14.583 15H16.2497C16.4798 15 16.6663 14.8135 16.6663 14.5833V11.6667"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default Car
