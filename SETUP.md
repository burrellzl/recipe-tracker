# Recipe Keeper beginner setup

Follow these sections in order. You do not need a coding program or terminal.

## 1. Create the Supabase project

1. Open [supabase.com](https://supabase.com) and click **Start your project**.
2. Sign in and click **New project**.
3. Choose your organization.
4. Enter `Recipe Keeper` for the project name.
5. Create a strong database password and save it in your password manager. Do **not** paste it into GitHub or the app.
6. Choose the region closest to you.
7. The Free plan is enough for a personal library of at least 100 recipes.
8. Click **Create new project** and wait for setup to finish.

## 2. Create the database and security rules

The SQL below creates new Recipe Keeper tables and policies. It does not delete recipe data. It uses `create or replace` for two helper functions and updates the settings of the `recipe-images` bucket if that bucket already exists. On a new project, nothing is being replaced.

1. In Supabase, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. In GitHub, open `supabase/schema.sql`, click the copy button above the code, and paste it into Supabase.
4. Click **Run** in the lower-right corner.
5. You should see **Success. No rows returned**.
6. Click **Table Editor** in the left sidebar. You should see `recipes`, `ingredients`, and `directions`.
7. Click **Storage**. You should see a private bucket named `recipe-images`.

If Supabase reports that a policy already exists, the script was probably run before. Do not delete tables. Ask for help with the exact error message.

### What the security rules mean

- Every recipe stores the account ID that owns it.
- Recipe policies compare that owner ID to the currently signed-in account.
- Ingredient and direction policies check the owner of their parent recipe.
- Images must live inside a folder named with the signed-in account ID.
- The image bucket is private; the app creates temporary signed links to display images.
- The `save_recipe` function runs as the signed-in person and respects all Row Level Security rules.

## 3. Confirm email/password authentication

1. In Supabase, click **Authentication** in the left sidebar.
2. Click **Providers**.
3. Find **Email** and confirm it is enabled.
4. Keep **Email + Password** enabled.
5. For the simplest first test, you may temporarily turn **Confirm email** off. If you keep it on, you must open the confirmation email before signing in.
6. Click **Save** if you changed anything.

## 4. Find the two frontend-safe connection values

1. Click the **Project Settings** gear near the bottom of the Supabase sidebar.
2. Click **API Keys** or **Data API** (the label can vary slightly).
3. Copy the **Project URL**. It looks like `https://abcdefgh.supabase.co`.
4. Copy the **Publishable key**. In older projects this can be labeled **anon public**.
5. Never copy the **service_role** or secret key into this app.

The project URL and publishable/anonymous key are safe to use in browser code because Row Level Security provides the real protection.

## 5. Connect GitHub Pages to Supabase Authentication

1. In Supabase, click **Authentication**.
2. Click **URL Configuration**.
3. Set **Site URL** to `https://burrellzl.github.io/recipe-tracker/`.
4. Under **Redirect URLs**, click **Add URL**.
5. Add `https://burrellzl.github.io/recipe-tracker/`.
6. Save the changes.

## 6. Add the connection values to GitHub

Only do this with the Project URL and publishable/anonymous key—not a secret key.

1. Open the `recipe-tracker` repository on GitHub.
2. Open the `js` folder and click `config.js`.
3. Click the pencil icon labeled **Edit this file**.
4. Replace `YOUR_SUPABASE_PROJECT_URL` with the Project URL.
5. Replace `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with the publishable/anonymous key.
6. Keep the quotation marks around both values.
7. Click **Commit changes…**.
8. Enter `Connect Recipe Keeper to Supabase` as the commit message.
9. Select **Commit directly to the main branch** and click **Commit changes**.

## 7. Enable GitHub Pages

1. Open `https://github.com/burrellzl/recipe-tracker`.
2. Click the repository’s **Settings** tab.
3. Click **Pages** in the left sidebar under **Code and automation**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Set the branch to `main`.
6. Set the folder to `/ (root)`.
7. Click **Save**.
8. Wait two to five minutes, then refresh the Pages settings screen.
9. GitHub should show the address `https://burrellzl.github.io/recipe-tracker/`.

If deployment fails, click the repository’s **Actions** tab, open the failed **pages build and deployment** run, and read the first red error. Confirm that Pages still points to `main` and `/ (root)`.

## 8. Create the first account and test a recipe

1. Open `https://burrellzl.github.io/recipe-tracker/`.
2. Click **Create an account**.
3. Enter your email and a password of at least six characters.
4. If email confirmation is enabled, open the Supabase email and click its confirmation link.
5. Sign in.
6. Click **Add recipe**.
7. Enter a title, at least one ingredient, and at least one direction.
8. For a cost test, enter `24.00` for total recipe cost and `8` for actual servings. You should immediately see `$3.00` per serving.
9. Save the recipe. It should appear in the library.
10. Open the recipe and change the temporary servings. Ingredient amounts should change, but the `$3.00` stored cost per serving should not.

## 9. Test account privacy

This test needs a second email address.

1. Sign out of Recipe Keeper.
2. Create and sign in to a second account.
3. Confirm that the first account’s recipes and images do not appear.
4. Add a small test recipe in the second account.
5. Sign out and return to the first account.
6. Confirm that only the first account’s recipes appear.

If either account can see the other account’s data, stop using the app and ask for help before adding private information.

## 10. Install the PWA

### iPhone or iPad

1. Open the live app in **Safari**.
2. Tap the **Share** button (a square with an upward arrow).
3. Scroll and tap **Add to Home Screen**.
4. Tap **Add**.

### Android

1. Open the live app in **Chrome**.
2. Tap the three-dot menu.
3. Tap **Install app** or **Add to Home screen**.
4. Confirm the installation.

### Desktop Chrome or Edge

1. Open the live app.
2. Look for the install icon at the right side of the address bar.
3. Click it and choose **Install**.

## Updating the live app

Every commit to the `main` branch automatically starts another GitHub Pages deployment. It usually becomes live within a few minutes. The service worker checks for updated files when the app is reopened; if an old version remains visible, close all installed app/browser tabs and reopen it.
