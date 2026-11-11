// Shared by the tests that go through the setup: passes the account screens that now come first (date
// of birth as an adult, email, code + terms). Does nothing if they aren't showing (a saved page, ?account=0).
// Returns whether it passed them.
module.exports = async function passAccount(t) {
  if (!(await t.ev(`return !!document.querySelector('.fr.is-account')`))) return false;
  const set = (sel, val) => t.ev(`const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(val)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
  await set('.fr-form select[name=m]', '6'); await set('.fr-form input[name=d]', '15'); await set('.fr-form input[name=y]', '1998');
  await t.clickSel('.fr-form .btn-go'); await t.sleep(700);
  await set('.fr-form input[name=email]', 'athlete@example.com');
  await t.clickSel('.fr-form .btn-go'); await t.sleep(1100);
  await set('.fr-form input[name=code]', '20481937');
  await t.ev(`const c = document.querySelector('.fr-form input[name=terms]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return 1`);
  await t.clickSel('.fr-form .btn-go'); await t.sleep(1100);
  return true;
};
