import LoginTemplate from "@modules/account/templates/login-template"

// No metadata here: next to the dashboard slot it would name a signed-in
// shopper's account page "Увійти". The page title comes from @dashboard.
export default function Login() {
  return <LoginTemplate />
}
