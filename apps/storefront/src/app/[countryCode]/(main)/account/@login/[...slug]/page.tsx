// A signed-out visitor who opens any page of the account (orders, profile,
// addresses) gets the sign-in form at that address; after signing in the same
// address shows the page they asked for. No metadata here: it would override
// the page's own title once the visitor is signed in.
export { default } from "../page"
