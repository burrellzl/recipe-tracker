(function () {
  'use strict';

  const U = window.RecipeUtils;
  const DB = window.RecipeDB;
  const app = document.getElementById('app');
  const header = document.getElementById('site-header');
  const offlineBanner = document.getElementById('offline-banner');
  const state = {
    session: null,
    recipes: [],
    loading: false,
    authMode: 'signin',
    search: '',
    category: 'all',
    favoritesOnly: false,
    sort: 'updated',
    formDraft: null,
    formRecipeId: null,
    submitting: false
  };

  function toast(message, type = 'info') {
    const region = document.getElementById('toast-region');
    [...region.children].forEach((item) => {
      if (item.textContent === message) item.remove();
    });
    const element = document.createElement('div');
    element.className = `toast toast-${type}`;
    element.textContent = message;
    region.append(element);
    setTimeout(() => element.remove(), 4500);
  }

  function readableError(error, fallback = 'Something went wrong. Please try again.') {
    console.error(error);
    if (!navigator.onLine) return 'You appear to be offline. Reconnect and try again.';
    const message = error?.message || '';
    if (/failed to fetch/i.test(message)) return 'Recipe Keeper could not reach Supabase. Check your connection and try again.';
    if (/invalid login credentials/i.test(message)) return 'That email or password was not recognized.';
    if (/row-level security/i.test(message)) return 'Supabase blocked this request. Confirm that the database setup SQL was run.';
    return message || fallback;
  }

  function showLoading(message = 'Loading…') {
    app.innerHTML = `<div class="page-loading" role="status"><span class="spinner"></span> ${U.escapeHTML(message)}</div>`;
  }

  function setOnlineState() {
    offlineBanner.hidden = navigator.onLine;
    if (navigator.onLine && state.session) refreshRecipes(false);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('recipe-theme', theme);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.textContent = theme === 'dark' ? '☀' : '☾';
  }

  function renderSetupRequired() {
    header.hidden = true;
    app.innerHTML = `
      <section class="centered-page">
        <div class="setup-card">
          <span class="eyebrow">One-time setup</span>
          <h1>Recipe Keeper is ready to connect</h1>
          <p>The app files are working, but the Supabase project address and frontend-safe key have not been added yet.</p>
          <ol class="setup-steps">
            <li>Create the Supabase project.</li>
            <li>Run the included <code>supabase/schema.sql</code>.</li>
            <li>Add the project URL and publishable key to <code>js/config.js</code>.</li>
          </ol>
          <p class="help-text">Never add the service-role key or database password to this app.</p>
        </div>
      </section>`;
  }

  function renderAuth() {
    header.hidden = true;
    const signUp = state.authMode === 'signup';
    app.innerHTML = `
      <section class="auth-layout">
        <div class="auth-intro">
          <span class="brand-mark large" aria-hidden="true">R</span>
          <span class="eyebrow">Your personal cookbook</span>
          <h1>Recipes you love,<br>ready when you are.</h1>
          <p>Save recipes, scale servings, run cooking timers, and keep everything synchronized across your devices.</p>
          <div class="auth-features" aria-label="App features">
            <span>✓ Private account</span><span>✓ Works on phone &amp; computer</span><span>✓ Installable app</span>
          </div>
        </div>
        <div class="auth-card">
          <h2>${signUp ? 'Create your account' : 'Welcome back'}</h2>
          <p>${signUp ? 'Start building your recipe library.' : 'Sign in to open your recipe library.'}</p>
          <form id="auth-form">
            <label>Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
            <label>Password<input name="password" type="password" autocomplete="${signUp ? 'new-password' : 'current-password'}" minlength="6" required placeholder="At least 6 characters"></label>
            <button class="button button-primary button-full" type="submit">${signUp ? 'Create account' : 'Sign in'}</button>
          </form>
          <button class="text-button" id="switch-auth-mode" type="button">
            ${signUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
        </div>
      </section>`;
  }

  function showSignedInHeader() {
    header.hidden = false;
    setTheme(document.documentElement.dataset.theme || 'light');
  }

  function costPerServing(recipe) {
    const total = Number(recipe.total_cost);
    const servings = Number(recipe.actual_servings);
    if (recipe.total_cost === null || recipe.total_cost === undefined || !Number.isFinite(total) || !Number.isFinite(servings) || servings <= 0) return null;
    return total / servings;
  }

  function costPreviewText(totalValue, servingsValue) {
    if (totalValue === '' && servingsValue === '') return 'Cost not entered';
    if (totalValue !== '' && servingsValue === '') return 'Enter actual servings';
    if (totalValue === '' && servingsValue !== '') return 'Enter total cost';
    const total = Number(totalValue);
    const servings = Number(servingsValue);
    if (!Number.isFinite(total) || total < 0 || !Number.isFinite(servings) || servings <= 0) return 'Check cost values';
    return U.formatCurrency(total / servings);
  }

  function getFilteredRecipes() {
    const search = state.search.trim().toLowerCase();
    let recipes = state.recipes.filter((recipe) => {
      const matchesSearch = !search || recipe.title.toLowerCase().includes(search);
      const matchesCategory = state.category === 'all' || (recipe.category || 'Uncategorized') === state.category;
      return matchesSearch && matchesCategory && (!state.favoritesOnly || recipe.is_favorite);
    });
    recipes = [...recipes].sort((a, b) => {
      if (state.sort === 'title') return a.title.localeCompare(b.title);
      if (state.sort === 'time') return (Number(a.prep_minutes) + Number(a.cook_minutes)) - (Number(b.prep_minutes) + Number(b.cook_minutes));
      if (state.sort === 'cost') return (costPerServing(a) ?? Infinity) - (costPerServing(b) ?? Infinity);
      return new Date(b.updated_at) - new Date(a.updated_at);
    });
    return recipes;
  }

  function recipeCard(recipe) {
    const cost = costPerServing(recipe);
    const totalTime = Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0);
    return `
      <article class="recipe-card">
        <a class="recipe-card-link" href="#/recipe/${U.escapeHTML(recipe.id)}" aria-label="Open ${U.escapeHTML(recipe.title)}">
          <div class="recipe-card-image ${recipe.image_url ? '' : 'image-placeholder'}">
            ${recipe.image_url ? `<img src="${U.escapeHTML(recipe.image_url)}" alt="${U.escapeHTML(recipe.title)}" loading="lazy">` : '<span aria-hidden="true">♨</span>'}
          </div>
          <div class="recipe-card-body">
            <span class="category-pill">${U.escapeHTML(recipe.category || 'Uncategorized')}</span>
            <h2>${U.escapeHTML(recipe.title)}</h2>
            <div class="recipe-meta">
              <span>◷ ${U.formatMinutes(totalTime)}</span>
              <span>◎ ${U.formatQuantity(recipe.default_servings)} servings</span>
            </div>
            ${cost === null ? '' : `<div class="card-cost">${U.formatCurrency(cost)} <span>per serving</span></div>`}
          </div>
        </a>
        <button class="favorite-button ${recipe.is_favorite ? 'is-favorite' : ''}" type="button" data-favorite="${U.escapeHTML(recipe.id)}" aria-label="${recipe.is_favorite ? 'Remove from' : 'Add to'} favorites">${recipe.is_favorite ? '♥' : '♡'}</button>
      </article>`;
  }

  function renderHome() {
    showSignedInHeader();
    const categories = [...new Set(state.recipes.map((recipe) => recipe.category || 'Uncategorized'))].sort();
    const filtered = getFilteredRecipes();
    app.innerHTML = `
      <section class="page library-page">
        <div class="page-heading">
          <div><span class="eyebrow">My kitchen</span><h1>Recipe library</h1><p>${state.recipes.length} ${state.recipes.length === 1 ? 'recipe' : 'recipes'} saved</p></div>
          <a class="button button-primary" href="#/new">＋ Add recipe</a>
        </div>

        <div class="library-tools">
          <label class="search-field"><span class="sr-only">Search recipes</span><span aria-hidden="true">⌕</span><input id="recipe-search" type="search" value="${U.escapeHTML(state.search)}" placeholder="Search recipes…"></label>
          <label><span class="sr-only">Filter by category</span><select id="category-filter"><option value="all">All categories</option>${categories.map((category) => `<option ${state.category === category ? 'selected' : ''}>${U.escapeHTML(category)}</option>`).join('')}</select></label>
          <label><span class="sr-only">Sort recipes</span><select id="sort-recipes">
            <option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>Recently updated</option>
            <option value="title" ${state.sort === 'title' ? 'selected' : ''}>Name A–Z</option>
            <option value="time" ${state.sort === 'time' ? 'selected' : ''}>Shortest total time</option>
            <option value="cost" ${state.sort === 'cost' ? 'selected' : ''}>Lowest cost</option>
          </select></label>
          <button id="favorites-filter" class="button ${state.favoritesOnly ? 'button-active' : 'button-secondary'}" type="button">♥ Favorites</button>
          <button id="random-recipe" class="button button-secondary" type="button" ${filtered.length ? '' : 'disabled'}>⚄ Random meal</button>
        </div>

        <div class="backup-tools">
          <button id="export-backup" class="text-button" type="button">↓ Export backup</button>
          <label class="text-button file-label">↑ Import backup<input id="import-backup" type="file" accept="application/json,.json"></label>
        </div>

        <div id="recipe-results">
          ${filtered.length ? `<div class="recipe-grid">${filtered.map(recipeCard).join('')}</div>` : `
            <div class="empty-state">
              <div class="empty-icon" aria-hidden="true">⌁</div>
              <h2>${state.recipes.length ? 'No recipes match those filters' : 'Your recipe box is empty'}</h2>
              <p>${state.recipes.length ? 'Try a different search or clear one of the filters.' : 'Add your first recipe and it will appear here on every device.'}</p>
              ${state.recipes.length ? '<button id="clear-filters" class="button button-secondary" type="button">Clear filters</button>' : '<a class="button button-primary" href="#/new">Add your first recipe</a>'}
            </div>`}
        </div>
      </section>`;
  }

  function blankDraft() {
    return {
      title: '', description: '', category: '', total_minutes: 0,
      default_servings: 4, notes: '', total_cost: '', actual_servings: '', cost_notes: '',
      is_favorite: false, image_path: null, image_url: null, imageFile: null, removeImage: false,
      ingredients: [{ quantity: 1, unit: '', name: '', note: '' }],
      directions: [{ instruction: '', timer_hours: 0, timer_minutes: 0, timer_seconds: 0 }]
    };
  }

  function draftFromRecipe(recipe) {
    return {
      ...recipe,
      total_minutes: Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0),
      total_cost: recipe.total_cost ?? '',
      actual_servings: recipe.actual_servings ?? '',
      imageFile: null,
      removeImage: false,
      ingredients: recipe.ingredients.map(({ quantity, unit, name, note }) => ({ quantity, unit: unit || '', name, note: note || '' })),
      directions: recipe.directions.map((step) => ({
        instruction: step.instruction,
        timer_hours: Math.floor((step.timer_seconds || 0) / 3600),
        timer_minutes: Math.floor(((step.timer_seconds || 0) % 3600) / 60),
        timer_seconds: (step.timer_seconds || 0) % 60
      }))
    };
  }

  function ingredientRow(item, index, length) {
    return `<div class="form-list-row ingredient-form-row" data-ingredient-row>
      <div class="compact-fields">
        <label>Quantity<input name="ingredient_quantity" type="number" inputmode="decimal" min="0.001" step="any" value="${U.escapeHTML(item.quantity)}" required></label>
        <label>Unit<input name="ingredient_unit" value="${U.escapeHTML(item.unit)}" placeholder="cups"></label>
      </div>
      <label>Ingredient name<input name="ingredient_name" value="${U.escapeHTML(item.name)}" placeholder="All-purpose flour" required></label>
      <label>Optional note<input name="ingredient_note" value="${U.escapeHTML(item.note)}" placeholder="Sifted, divided, for garnish…"></label>
      <div class="row-actions">
        <button class="icon-button" type="button" data-move-ingredient="${index}" data-direction="up" ${index === 0 ? 'disabled' : ''} aria-label="Move ingredient up">↑</button>
        <button class="icon-button" type="button" data-move-ingredient="${index}" data-direction="down" ${index === length - 1 ? 'disabled' : ''} aria-label="Move ingredient down">↓</button>
        <button class="icon-button danger" type="button" data-remove-ingredient="${index}" ${length === 1 ? 'disabled' : ''} aria-label="Remove ingredient">×</button>
      </div>
    </div>`;
  }

  function directionRow(step, index, length) {
    return `<div class="form-list-row direction-form-row" data-direction-row>
      <div class="step-number">${index + 1}</div>
      <label>Instruction<textarea name="direction_instruction" rows="3" placeholder="Describe this cooking step…" required>${U.escapeHTML(step.instruction)}</textarea></label>
      <fieldset class="timer-fields"><legend>Optional timer</legend>
        <label>Hours<input name="timer_hours" type="number" inputmode="numeric" min="0" step="1" value="${U.escapeHTML(step.timer_hours || 0)}"></label>
        <label>Minutes<input name="timer_minutes" type="number" inputmode="numeric" min="0" max="59" step="1" value="${U.escapeHTML(step.timer_minutes || 0)}"></label>
        <label>Seconds<input name="timer_seconds" type="number" inputmode="numeric" min="0" max="59" step="1" value="${U.escapeHTML(step.timer_seconds || 0)}"></label>
      </fieldset>
      <div class="row-actions">
        <button class="icon-button" type="button" data-move-direction="${index}" data-direction="up" ${index === 0 ? 'disabled' : ''} aria-label="Move step up">↑</button>
        <button class="icon-button" type="button" data-move-direction="${index}" data-direction="down" ${index === length - 1 ? 'disabled' : ''} aria-label="Move step down">↓</button>
        <button class="icon-button danger" type="button" data-remove-direction="${index}" ${length === 1 ? 'disabled' : ''} aria-label="Remove step">×</button>
      </div>
    </div>`;
  }

  function renderRecipeForm(draft, recipeId = null) {
    showSignedInHeader();
    state.formDraft = draft;
    state.formRecipeId = recipeId;
    const editing = Boolean(recipeId);
    const currentCost = costPreviewText(draft.total_cost, draft.actual_servings);
    app.innerHTML = `
      <section class="page form-page">
        <div class="form-page-heading"><a class="back-link" href="${editing ? `#/recipe/${recipeId}` : '#/'}">← Cancel</a><div><span class="eyebrow">${editing ? 'Update recipe' : 'New recipe'}</span><h1>${editing ? 'Edit recipe' : 'Add a recipe'}</h1></div></div>
        <form id="recipe-form" novalidate>
          <section class="form-section"><h2>Basics</h2><p>The information you use to recognize and organize this recipe.</p>
            <div class="field-grid">
              <label class="field-span-2">Recipe title<input name="title" value="${U.escapeHTML(draft.title)}" maxlength="120" required placeholder="Chicken pesto pasta"></label>
              <label>Category<input name="category" value="${U.escapeHTML(draft.category || '')}" maxlength="60" placeholder="Dinner"></label>
              <label class="checkbox-label"><input name="is_favorite" type="checkbox" ${draft.is_favorite ? 'checked' : ''}> Mark as favorite</label>
              <label class="field-span-2">Description<textarea name="description" rows="3" maxlength="1000" placeholder="A quick description of the recipe…">${U.escapeHTML(draft.description || '')}</textarea></label>
              <label>Total time (minutes)<input name="total_minutes" type="number" inputmode="numeric" min="0" step="1" value="${U.escapeHTML(draft.total_minutes || 0)}" required></label>
              <label>Default servings<input name="default_servings" type="number" inputmode="decimal" min="0.01" step="any" value="${U.escapeHTML(draft.default_servings)}" required></label>
            </div>
          </section>

          <section class="form-section"><h2>Recipe image</h2><p>Large photos are resized before upload to save storage.</p>
            <div class="image-field">
              <div class="image-preview ${draft.imagePreview || (!draft.removeImage && draft.image_url) ? '' : 'image-placeholder'}">
                ${draft.imagePreview || (!draft.removeImage && draft.image_url) ? `<img src="${U.escapeHTML(draft.imagePreview || draft.image_url)}" alt="Recipe preview">` : '<span aria-hidden="true">♨</span>'}
              </div>
              <div><label class="button button-secondary file-label">Choose image<input id="recipe-image" type="file" accept="image/jpeg,image/png,image/webp"></label>
              ${draft.imageFile ? '<p class="help-text">A new image is selected.</p>' : ''}
              ${draft.image_path ? `<label class="checkbox-label"><input name="remove_image" type="checkbox" ${draft.removeImage ? 'checked' : ''}> Remove current image</label>` : ''}</div>
            </div>
          </section>

          <section class="form-section"><div class="section-heading"><div><h2>Ingredients</h2><p>Keep quantity, unit, name, and preparation notes separate.</p></div><button class="button button-secondary" id="add-ingredient" type="button">＋ Add ingredient</button></div>
            <div id="ingredient-form-list" class="form-list">${draft.ingredients.map((item, index) => ingredientRow(item, index, draft.ingredients.length)).join('')}</div>
          </section>

          <section class="form-section"><div class="section-heading"><div><h2>Directions</h2><p>Add numbered steps and an optional timer for any step.</p></div><button class="button button-secondary" id="add-direction" type="button">＋ Add step</button></div>
            <div id="direction-form-list" class="form-list">${draft.directions.map((step, index) => directionRow(step, index, draft.directions.length)).join('')}</div>
          </section>

          <section class="form-section"><h2>Cost per serving</h2><p>Cost details are optional. When you enter a cost, actual servings starts with the default serving count—change it if the recipe produced a different amount.</p>
            <div class="field-grid cost-fields">
              <label>Total recipe cost ($)<input name="total_cost" type="number" inputmode="decimal" min="0" step="0.01" value="${U.escapeHTML(draft.total_cost)}" placeholder="Enter cost"></label>
              <label>Actual servings produced<input name="actual_servings" type="number" inputmode="decimal" min="0.01" step="any" value="${U.escapeHTML(draft.actual_servings)}" placeholder="Enter servings"></label>
              <div class="cost-preview"><span>Cost per serving</span><strong id="cost-preview">${currentCost}</strong></div>
              <label class="field-span-2">Optional cost notes<textarea name="cost_notes" rows="2" placeholder="Bought in bulk, already owned the spices…">${U.escapeHTML(draft.cost_notes || '')}</textarea></label>
            </div>
          </section>

          <section class="form-section"><h2>Additional notes</h2><p>Anything helpful that does not belong in an ingredient or cooking step.</p>
            <label><span class="sr-only">Additional notes</span><textarea name="notes" rows="5" placeholder="Storage, substitutions, what to change next time…">${U.escapeHTML(draft.notes || '')}</textarea></label>
          </section>

          <div class="sticky-form-actions"><a class="button button-secondary" href="${editing ? `#/recipe/${recipeId}` : '#/'}">Cancel</a><button id="save-recipe" class="button button-primary" type="submit">${editing ? 'Save changes' : 'Save recipe'}</button></div>
        </form>
      </section>`;
  }

  function syncDraftFromForm() {
    const form = document.getElementById('recipe-form');
    if (!form || !state.formDraft) return;
    const data = new FormData(form);
    Object.assign(state.formDraft, {
      title: data.get('title') || '', description: data.get('description') || '', category: data.get('category') || '',
      total_minutes: data.get('total_minutes'), default_servings: data.get('default_servings'),
      notes: data.get('notes') || '', total_cost: data.get('total_cost'), actual_servings: data.get('actual_servings'),
      cost_notes: data.get('cost_notes') || '', is_favorite: data.has('is_favorite'), removeImage: data.has('remove_image')
    });
    state.formDraft.ingredients = [...form.querySelectorAll('[data-ingredient-row]')].map((row) => ({
      quantity: row.querySelector('[name="ingredient_quantity"]').value,
      unit: row.querySelector('[name="ingredient_unit"]').value,
      name: row.querySelector('[name="ingredient_name"]').value,
      note: row.querySelector('[name="ingredient_note"]').value
    }));
    state.formDraft.directions = [...form.querySelectorAll('[data-direction-row]')].map((row) => ({
      instruction: row.querySelector('[name="direction_instruction"]').value,
      timer_hours: row.querySelector('[name="timer_hours"]').value,
      timer_minutes: row.querySelector('[name="timer_minutes"]').value,
      timer_seconds: row.querySelector('[name="timer_seconds"]').value
    }));
  }

  function recipePayload(recipe, imagePath = recipe.image_path) {
    const totalMinutes = recipe.total_minutes === undefined
      ? Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0)
      : Number(recipe.total_minutes || 0);
    return {
      title: String(recipe.title || '').trim(),
      description: String(recipe.description || '').trim() || null,
      category: String(recipe.category || '').trim() || null,
      prep_minutes: 0,
      cook_minutes: totalMinutes,
      default_servings: Number(recipe.default_servings),
      notes: String(recipe.notes || '').trim() || null,
      total_cost: recipe.total_cost === '' || recipe.total_cost === null ? null : Number(recipe.total_cost),
      actual_servings: recipe.actual_servings === '' || recipe.actual_servings === null ? null : Number(recipe.actual_servings),
      cost_notes: String(recipe.cost_notes || '').trim() || null,
      is_favorite: Boolean(recipe.is_favorite),
      image_path: imagePath || null
    };
  }

  function nestedPayload(recipe) {
    return {
      ingredients: recipe.ingredients.map((item, index) => ({
        position: index, quantity: Number(item.quantity), unit: String(item.unit || '').trim() || null,
        name: String(item.name || '').trim(), note: String(item.note || '').trim() || null
      })),
      directions: recipe.directions.map((step, index) => {
        const hasTimerParts = Object.prototype.hasOwnProperty.call(step, 'timer_hours') || Object.prototype.hasOwnProperty.call(step, 'timer_minutes');
        const timerSeconds = hasTimerParts
          ? (Number(step.timer_hours) || 0) * 3600 + (Number(step.timer_minutes) || 0) * 60 + (Number(step.timer_seconds) || 0)
          : Number(step.timer_seconds || 0);
        return { position: index, instruction: String(step.instruction || '').trim(), timer_seconds: timerSeconds };
      })
    };
  }

  function validateDraft(draft) {
    if (!draft.title.trim()) return 'Enter a recipe title.';
    if (!Number.isFinite(Number(draft.default_servings)) || Number(draft.default_servings) <= 0) return 'Default servings must be greater than zero.';
    if (!Number.isInteger(Number(draft.total_minutes)) || Number(draft.total_minutes) < 0) return 'Total time must be a whole number of zero or more.';
    if (!draft.ingredients.length || draft.ingredients.some((item) => !item.name.trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) return 'Every ingredient needs a name and a quantity greater than zero.';
    if (!draft.directions.length || draft.directions.some((step) => !step.instruction.trim())) return 'Every cooking step needs an instruction.';
    if (draft.directions.some((step) => [step.timer_hours, step.timer_minutes, step.timer_seconds].some((value) => !Number.isInteger(Number(value)) || Number(value) < 0)) || draft.directions.some((step) => Number(step.timer_minutes) > 59 || Number(step.timer_seconds) > 59)) return 'Timer values must be valid whole numbers; minutes and seconds cannot exceed 59.';
    const hasCost = draft.total_cost !== '';
    const hasActualServings = draft.actual_servings !== '';
    if (hasCost !== hasActualServings) return 'Enter both total cost and actual servings, or leave both blank.';
    if (hasCost && (!Number.isFinite(Number(draft.total_cost)) || Number(draft.total_cost) < 0)) return 'Total recipe cost cannot be negative.';
    if (hasActualServings && (!Number.isFinite(Number(draft.actual_servings)) || Number(draft.actual_servings) <= 0)) return 'Actual servings produced must be greater than zero.';
    return null;
  }

  function renderDetail(recipe) {
    showSignedInHeader();
    const progress = U.readCookingProgress(recipe.id);
    const cost = costPerServing(recipe);
    const totalTime = Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0);
    app.innerHTML = `
      <article class="page recipe-detail" data-recipe-id="${U.escapeHTML(recipe.id)}" data-servings="${U.escapeHTML(recipe.default_servings)}" data-original-servings="${U.escapeHTML(recipe.default_servings)}">
        <div class="detail-topbar"><a class="back-link" href="#/">← All recipes</a><div class="detail-actions"><button class="button button-secondary" type="button" data-duplicate="${U.escapeHTML(recipe.id)}">Duplicate</button><a class="button button-secondary" href="#/edit/${U.escapeHTML(recipe.id)}">Edit</a><button class="button button-danger" type="button" data-delete="${U.escapeHTML(recipe.id)}">Delete</button></div></div>
        <header class="recipe-hero">
          <div class="recipe-hero-copy"><div><span class="category-pill">${U.escapeHTML(recipe.category || 'Uncategorized')}</span>${recipe.is_favorite ? '<span class="favorite-label">♥ Favorite</span>' : ''}</div><h1>${U.escapeHTML(recipe.title)}</h1>${recipe.description ? `<p>${U.escapeHTML(recipe.description)}</p>` : ''}
            <div class="hero-meta"><div><span>Total time</span><strong>${U.formatMinutes(totalTime)}</strong></div></div>
          </div>
          <div class="recipe-hero-image ${recipe.image_url ? '' : 'image-placeholder'}">${recipe.image_url ? `<img src="${U.escapeHTML(recipe.image_url)}" alt="${U.escapeHTML(recipe.title)}">` : '<span aria-hidden="true">♨</span>'}</div>
        </header>

        <section class="detail-section servings-section"><div><span class="eyebrow">Adjust amounts</span><h2>Servings</h2><p>This temporarily scales ingredient quantities without changing the saved recipe or cost calculation.</p></div>
          <div class="serving-control"><button class="icon-button large" id="decrease-servings" type="button" aria-label="Decrease servings">−</button><div><strong id="serving-count">${U.formatQuantity(recipe.default_servings)}</strong><span>servings</span></div><button class="icon-button large" id="increase-servings" type="button" aria-label="Increase servings">＋</button></div>
        </section>

        <div class="detail-columns">
          <section class="detail-section"><div class="section-heading"><div><span class="eyebrow">Gather</span><h2>Ingredients</h2></div></div>
            <div class="cooking-list ingredient-list">${recipe.ingredients.map((item, index) => `
              <label class="cooking-item ${progress.ingredients.includes(index) ? 'is-complete' : ''}"><input type="checkbox" data-cooking-check="ingredient" data-index="${index}" ${progress.ingredients.includes(index) ? 'checked' : ''}><span class="custom-check"></span><span><strong data-scaled-quantity data-base="${U.escapeHTML(item.quantity)}">${U.formatQuantity(item.quantity)}</strong> ${U.escapeHTML(item.unit || '')} ${U.escapeHTML(item.name)}${item.note ? `<small>${U.escapeHTML(item.note)}</small>` : ''}</span></label>`).join('')}</div>
          </section>

          <section class="detail-section"><div class="section-heading"><div><span class="eyebrow">Cook</span><h2>Directions</h2></div></div>
            <div class="cooking-list direction-list">${recipe.directions.map((step, index) => {
              const timerId = `${recipe.id}:${index}`;
              return `<div class="direction-item ${progress.directions.includes(index) ? 'is-complete' : ''}">
                <label class="direction-check"><input type="checkbox" data-cooking-check="direction" data-index="${index}" ${progress.directions.includes(index) ? 'checked' : ''}><span class="custom-check">${index + 1}</span><span>${U.escapeHTML(step.instruction)}</span></label>
                ${step.timer_seconds ? `<div class="step-timer"><strong data-timer-display="${U.escapeHTML(timerId)}" data-duration="${step.timer_seconds}">${U.formatTimer(step.timer_seconds)}</strong><div>
                  <button class="button button-small button-primary" type="button" data-timer-start="${U.escapeHTML(timerId)}" data-duration="${step.timer_seconds}" data-label="${U.escapeHTML(`${recipe.title}: Step ${index + 1}`)}" data-recipe-id="${U.escapeHTML(recipe.id)}">Start</button>
                  <button class="button button-small button-secondary" type="button" data-timer-pause="${U.escapeHTML(timerId)}" hidden>Pause</button>
                  <button class="button button-small button-primary" type="button" data-timer-resume="${U.escapeHTML(timerId)}" hidden>Resume</button>
                  <button class="button button-small button-secondary" type="button" data-timer-reset="${U.escapeHTML(timerId)}">Reset</button>
                </div></div>` : ''}
              </div>`;
            }).join('')}</div>
          </section>
        </div>
        <button id="reset-progress" class="button button-secondary reset-progress" type="button">Reset ingredient and step checks</button>

        <section class="detail-section cost-panel"><div><span class="eyebrow">Recipe cost</span><h2>Cost per serving</h2>${recipe.cost_notes ? `<p>${U.escapeHTML(recipe.cost_notes)}</p>` : ''}</div>
          ${cost === null ? '<div class="cost-empty">Cost not entered</div>' : `<div class="cost-stats"><div><span>Total cost</span><strong>${U.formatCurrency(recipe.total_cost)}</strong></div><div><span>Actual servings produced</span><strong>${U.formatQuantity(recipe.actual_servings)}</strong></div><div class="cost-highlight"><span>Cost per serving</span><strong>${U.formatCurrency(cost)}</strong></div></div>`}
        </section>
        ${recipe.notes ? `<section class="detail-section notes-panel"><span class="eyebrow">Remember</span><h2>Additional notes</h2><p>${U.escapeHTML(recipe.notes).replaceAll('\n', '<br>')}</p></section>` : ''}
      </article>`;
    RecipeTimers.render();
  }

  async function refreshRecipes(render = true) {
    if (!state.session) return;
    if (!navigator.onLine) {
      if (state.recipes.length) renderRoute();
      else if (render) app.innerHTML = '<div class="error-state"><div><h1>You are offline</h1><p>Recipe Keeper opened successfully, but synchronized recipes need an internet connection after a fresh launch.</p><button class="button button-primary" onclick="location.reload()">Try again</button></div></div>';
      return;
    }
    try {
      if (render && !state.recipes.length) showLoading('Loading your recipes…');
      state.recipes = await DB.loadRecipes();
      if (render) renderRoute();
    } catch (error) {
      if (render) {
        toast(readableError(error), 'error');
        if (!state.recipes.length) app.innerHTML = '<div class="error-state"><h1>Recipes could not load</h1><p>Check your connection and Supabase setup, then try again.</p><button class="button button-primary" id="retry-load" type="button">Try again</button></div>';
      }
    }
  }

  async function renderRoute() {
    if (!DB.configured) { renderSetupRequired(); return; }
    if (!state.session) { renderAuth(); return; }
    showSignedInHeader();
    const route = (location.hash || '#/').slice(2).split('/');
    if (route[0] === 'new') { renderRecipeForm(blankDraft()); return; }
    if (route[0] === 'edit' && route[1]) {
      const recipe = state.recipes.find((item) => item.id === route[1]);
      if (!recipe) { location.hash = '#/'; return; }
      renderRecipeForm(draftFromRecipe(recipe), recipe.id);
      return;
    }
    if (route[0] === 'recipe' && route[1]) {
      let recipe = state.recipes.find((item) => item.id === route[1]);
      if (!recipe && navigator.onLine) {
        try { showLoading('Opening recipe…'); recipe = await DB.loadRecipe(route[1]); } catch { /* handled below */ }
      }
      if (!recipe) { app.innerHTML = '<div class="error-state"><h1>Recipe not found</h1><a class="button button-primary" href="#/">Return to recipes</a></div>'; return; }
      renderDetail(recipe);
      return;
    }
    renderHome();
  }

  async function handleAuthSubmit(form) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = state.authMode === 'signup' ? 'Creating account…' : 'Signing in…';
    const data = new FormData(form);
    try {
      if (state.authMode === 'signup') {
        const result = await DB.signUp(data.get('email').trim(), data.get('password'));
        if (!result.session) toast('Account created. Check your email for the confirmation link, then sign in.', 'success');
      } else {
        await DB.signIn(data.get('email').trim(), data.get('password'));
      }
    } catch (error) {
      toast(readableError(error), 'error');
      button.disabled = false;
      button.textContent = state.authMode === 'signup' ? 'Create account' : 'Sign in';
    }
  }

  async function handleRecipeSubmit(form) {
    if (state.submitting) return;
    syncDraftFromForm();
    if (state.formDraft.total_cost !== '' && state.formDraft.actual_servings === '') {
      state.formDraft.actual_servings = state.formDraft.default_servings;
    }
    const errorMessage = validateDraft(state.formDraft);
    if (errorMessage) { toast(errorMessage, 'error'); return; }
    state.submitting = true;
    const button = document.getElementById('save-recipe');
    button.disabled = true;
    button.textContent = 'Saving…';
    const oldImagePath = state.formDraft.image_path;
    let newImagePath = state.formDraft.removeImage ? null : oldImagePath;
    try {
      if (state.formDraft.imageFile) {
        const blob = await U.compressImage(state.formDraft.imageFile);
        newImagePath = await DB.uploadImage(blob, state.session.user.id);
      }
      const nested = nestedPayload(state.formDraft);
      const savedId = await DB.saveRecipe(state.formRecipeId, recipePayload(state.formDraft, newImagePath), nested.ingredients, nested.directions);
      if (oldImagePath && oldImagePath !== newImagePath) await DB.removeImageIfUnused(oldImagePath);
      state.recipes = await DB.loadRecipes();
      state.formDraft = null;
      toast(state.formRecipeId ? 'Recipe updated.' : 'Recipe saved.', 'success');
      location.hash = `#/recipe/${savedId}`;
    } catch (error) {
      if (newImagePath && newImagePath !== oldImagePath) await DB.removeImageIfUnused(newImagePath);
      toast(readableError(error, 'The recipe could not be saved.'), 'error');
      button.disabled = false;
      button.textContent = state.formRecipeId ? 'Save changes' : 'Save recipe';
    } finally {
      state.submitting = false;
    }
  }

  async function toggleFavorite(id) {
    const recipe = state.recipes.find((item) => item.id === id);
    if (!recipe) return;
    const nested = nestedPayload(recipe);
    try {
      await DB.saveRecipe(id, { ...recipePayload(recipe), is_favorite: !recipe.is_favorite }, nested.ingredients, nested.directions);
      recipe.is_favorite = !recipe.is_favorite;
      renderHome();
    } catch (error) { toast(readableError(error), 'error'); }
  }

  async function duplicateRecipe(id) {
    const recipe = state.recipes.find((item) => item.id === id);
    if (!recipe) return;
    const nested = nestedPayload(recipe);
    showLoading('Duplicating recipe…');
    try {
      const copiedImage = await DB.copyImage(recipe.image_path, state.session.user.id);
      const newId = await DB.saveRecipe(null, { ...recipePayload(recipe, copiedImage), title: `${recipe.title} (Copy)`, is_favorite: false }, nested.ingredients, nested.directions);
      state.recipes = await DB.loadRecipes();
      toast('Recipe duplicated.', 'success');
      location.hash = `#/recipe/${newId}`;
    } catch (error) { toast(readableError(error), 'error'); renderDetail(recipe); }
  }

  async function removeRecipe(id) {
    const recipe = state.recipes.find((item) => item.id === id);
    if (!recipe || !confirm(`Delete “${recipe.title}”? This cannot be undone.`)) return;
    try {
      await DB.deleteRecipe(id);
      await DB.removeImageIfUnused(recipe.image_path);
      localStorage.removeItem(`recipe-progress-${id}`);
      state.recipes = state.recipes.filter((item) => item.id !== id);
      toast('Recipe deleted.', 'success');
      location.hash = '#/';
    } catch (error) { toast(readableError(error), 'error'); }
  }

  function exportBackup() {
    const safeRecipes = state.recipes.map((recipe) => ({
      title: recipe.title, description: recipe.description, category: recipe.category,
      total_minutes: Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0),
      prep_minutes: 0, cook_minutes: Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0),
      default_servings: recipe.default_servings, notes: recipe.notes,
      total_cost: recipe.total_cost, actual_servings: recipe.actual_servings,
      cost_notes: recipe.cost_notes, is_favorite: recipe.is_favorite,
      image_path: recipe.image_path,
      ingredients: recipe.ingredients.map(({ quantity, unit, name, note, position }) => ({ quantity, unit, name, note, position })),
      directions: recipe.directions.map(({ instruction, timer_seconds, position }) => ({ instruction, timer_seconds, position }))
    }));
    U.downloadJSON(`recipe-keeper-backup-${new Date().toISOString().slice(0, 10)}.json`, {
      format: 'recipe-keeper-backup', version: 1, exported_at: new Date().toISOString(), recipes: safeRecipes
    });
    toast('Backup downloaded.', 'success');
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup.format !== 'recipe-keeper-backup' || backup.version !== 1 || !Array.isArray(backup.recipes)) throw new Error('This is not a valid Recipe Keeper backup.');
      if (backup.recipes.length > 500) throw new Error('This backup contains too many recipes to import at once.');
      if (!confirm(`Import ${backup.recipes.length} recipes? Existing recipes will stay in your library.`)) return;
      showLoading(`Importing ${backup.recipes.length} recipes…`);
      let imported = 0;
      for (const recipe of backup.recipes) {
        const draft = {
          ...blankDraft(), ...recipe,
          image_path: String(recipe.image_path || '').startsWith(`${state.session.user.id}/`) ? recipe.image_path : null,
          ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
          directions: Array.isArray(recipe.directions) ? recipe.directions : []
        };
        if (recipe.total_minutes === undefined) {
          draft.total_minutes = Number(recipe.prep_minutes || 0) + Number(recipe.cook_minutes || 0);
        }
        draft.directions = draft.directions.map((step) => {
          const seconds = Math.max(0, Number(step.timer_seconds) || 0);
          return {
            instruction: step.instruction,
            timer_hours: Math.floor(seconds / 3600),
            timer_minutes: Math.floor((seconds % 3600) / 60),
            timer_seconds: seconds % 60
          };
        });
        const validation = validateDraft(draft);
        if (validation) continue;
        const nested = nestedPayload(draft);
        await DB.saveRecipe(null, recipePayload(draft), nested.ingredients, nested.directions);
        imported += 1;
      }
      state.recipes = await DB.loadRecipes();
      renderHome();
      toast(`Imported ${imported} of ${backup.recipes.length} recipes.`, imported === backup.recipes.length ? 'success' : 'info');
    } catch (error) {
      toast(readableError(error, 'The backup could not be imported.'), 'error');
      renderHome();
    }
  }

  function moveItem(collection, index, direction) {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= collection.length) return;
    [collection[index], collection[target]] = [collection[target], collection[index]];
  }

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'auth-form') { event.preventDefault(); handleAuthSubmit(event.target); }
    if (event.target.id === 'recipe-form') { event.preventDefault(); handleRecipeSubmit(event.target); }
  });

  document.addEventListener('keydown', (event) => {
    const form = event.target.closest?.('#recipe-form');
    if (!form || event.key !== 'Enter' || event.target.matches('textarea, button, [type="submit"]')) return;
    event.preventDefault();
    const fields = [...form.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]), select, textarea')]
      .filter((field) => !field.disabled && field.offsetParent !== null);
    const nextField = fields[fields.indexOf(event.target) + 1];
    if (nextField) nextField.focus();
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'recipe-search') {
      state.search = event.target.value;
      const currentFocus = event.target.selectionStart;
      renderHome();
      const search = document.getElementById('recipe-search');
      search.focus(); search.setSelectionRange(currentFocus, currentFocus);
    }
    const recipeForm = event.target.closest('#recipe-form');
    if (recipeForm && event.target.name === 'total_cost') {
      const servingsInput = recipeForm.elements.actual_servings;
      if (event.target.value !== '' && servingsInput.value === '') {
        servingsInput.value = recipeForm.elements.default_servings.value;
        recipeForm.dataset.autoCostServings = 'true';
      } else if (event.target.value === '' && recipeForm.dataset.autoCostServings === 'true') {
        servingsInput.value = '';
        delete recipeForm.dataset.autoCostServings;
      }
    }
    if (recipeForm && event.target.name === 'actual_servings') delete recipeForm.dataset.autoCostServings;
    if (recipeForm && event.target.name === 'default_servings' && recipeForm.dataset.autoCostServings === 'true') {
      recipeForm.elements.actual_servings.value = event.target.value;
    }
    if (recipeForm && (event.target.closest('.cost-fields') || event.target.name === 'default_servings')) {
      const form = document.getElementById('recipe-form');
      document.getElementById('cost-preview').textContent = costPreviewText(form.elements.total_cost.value, form.elements.actual_servings.value);
    }
  });

  document.addEventListener('change', async (event) => {
    if (event.target.id === 'category-filter') { state.category = event.target.value; renderHome(); }
    if (event.target.id === 'sort-recipes') { state.sort = event.target.value; renderHome(); }
    if (event.target.id === 'import-backup') await importBackup(event.target.files[0]);
    if (event.target.id === 'recipe-image') {
      const file = event.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); return; }
      if (file.size > 20 * 1024 * 1024) { toast('Choose an image smaller than 20 MB.', 'error'); return; }
      syncDraftFromForm();
      if (state.formDraft.imagePreview) URL.revokeObjectURL(state.formDraft.imagePreview);
      state.formDraft.imageFile = file;
      state.formDraft.imagePreview = URL.createObjectURL(file);
      state.formDraft.removeImage = false;
      renderRecipeForm(state.formDraft, state.formRecipeId);
    }
    const check = event.target.closest('[data-cooking-check]');
    if (check) {
      const detail = check.closest('[data-recipe-id]');
      const progress = U.readCookingProgress(detail.dataset.recipeId);
      const key = check.dataset.cookingCheck === 'ingredient' ? 'ingredients' : 'directions';
      const index = Number(check.dataset.index);
      progress[key] = check.checked ? [...new Set([...progress[key], index])] : progress[key].filter((item) => item !== index);
      U.writeCookingProgress(detail.dataset.recipeId, progress);
      check.closest('.cooking-item, .direction-item').classList.toggle('is-complete', check.checked);
    }
  });

  document.addEventListener('click', async (event) => {
    if (RecipeTimers.handleClick(event)) return;
    if (event.target.id === 'switch-auth-mode') { state.authMode = state.authMode === 'signin' ? 'signup' : 'signin'; renderAuth(); return; }
    if (event.target.id === 'theme-toggle') { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); return; }
    if (event.target.id === 'sign-out-button') { try { await DB.signOut(); } catch (error) { toast(readableError(error), 'error'); } return; }
    if (event.target.id === 'retry-load') { refreshRecipes(); return; }
    if (event.target.id === 'favorites-filter') { state.favoritesOnly = !state.favoritesOnly; renderHome(); return; }
    if (event.target.id === 'clear-filters') { state.search = ''; state.category = 'all'; state.favoritesOnly = false; renderHome(); return; }
    if (event.target.id === 'random-recipe') { const recipes = getFilteredRecipes(); if (recipes.length) location.hash = `#/recipe/${recipes[Math.floor(Math.random() * recipes.length)].id}`; return; }
    if (event.target.id === 'export-backup') { exportBackup(); return; }
    if (event.target.id === 'add-ingredient') { syncDraftFromForm(); state.formDraft.ingredients.push({ quantity: 1, unit: '', name: '', note: '' }); renderRecipeForm(state.formDraft, state.formRecipeId); return; }
    if (event.target.id === 'add-direction') { syncDraftFromForm(); state.formDraft.directions.push({ instruction: '', timer_hours: 0, timer_minutes: 0, timer_seconds: 0 }); renderRecipeForm(state.formDraft, state.formRecipeId); return; }
    const removeIngredient = event.target.closest('[data-remove-ingredient]');
    if (removeIngredient) { syncDraftFromForm(); state.formDraft.ingredients.splice(Number(removeIngredient.dataset.removeIngredient), 1); renderRecipeForm(state.formDraft, state.formRecipeId); return; }
    const moveIngredient = event.target.closest('[data-move-ingredient]');
    if (moveIngredient) { syncDraftFromForm(); moveItem(state.formDraft.ingredients, Number(moveIngredient.dataset.moveIngredient), moveIngredient.dataset.direction); renderRecipeForm(state.formDraft, state.formRecipeId); return; }
    const removeDirection = event.target.closest('[data-remove-direction]');
    if (removeDirection) { syncDraftFromForm(); state.formDraft.directions.splice(Number(removeDirection.dataset.removeDirection), 1); renderRecipeForm(state.formDraft, state.formRecipeId); return; }
    const moveDirection = event.target.closest('[data-move-direction]');
    if (moveDirection) { syncDraftFromForm(); moveItem(state.formDraft.directions, Number(moveDirection.dataset.moveDirection), moveDirection.dataset.direction); renderRecipeForm(state.formDraft, state.formRecipeId); return; }
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) { event.preventDefault(); toggleFavorite(favorite.dataset.favorite); return; }
    const duplicate = event.target.closest('[data-duplicate]');
    if (duplicate) { duplicateRecipe(duplicate.dataset.duplicate); return; }
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) { removeRecipe(deleteButton.dataset.delete); return; }
    if (event.target.id === 'decrease-servings' || event.target.id === 'increase-servings') {
      const detail = event.target.closest('[data-servings]');
      const original = Number(detail.dataset.originalServings);
      let servings = Number(detail.dataset.servings);
      servings = event.target.id === 'increase-servings' ? servings + 1 : Math.max(0.25, servings - 1);
      detail.dataset.servings = servings;
      document.getElementById('serving-count').textContent = U.formatQuantity(servings);
      document.querySelectorAll('[data-scaled-quantity]').forEach((element) => { element.textContent = U.formatQuantity(Number(element.dataset.base) * servings / original); });
      return;
    }
    if (event.target.id === 'reset-progress') {
      const detail = event.target.closest('[data-recipe-id]');
      U.writeCookingProgress(detail.dataset.recipeId, { ingredients: [], directions: [] });
      detail.querySelectorAll('[data-cooking-check]').forEach((checkbox) => { checkbox.checked = false; checkbox.closest('.cooking-item, .direction-item').classList.remove('is-complete'); });
      toast('Cooking checks reset.', 'success');
    }
  });

  async function init() {
    setOnlineState();
    window.addEventListener('online', setOnlineState);
    window.addEventListener('offline', setOnlineState);
    window.addEventListener('hashchange', renderRoute);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker registration failed', error));
    if (!DB.configured) { renderSetupRequired(); return; }
    try {
      DB.initialize();
      state.session = await DB.getSession();
      DB.onAuthStateChange((_event, session) => {
        const changedUser = state.session?.user?.id !== session?.user?.id;
        state.session = session;
        if (!session) { state.recipes = []; renderAuth(); }
        else if (changedUser || !state.recipes.length) setTimeout(() => refreshRecipes(), 0);
      });
      if (state.session) await refreshRecipes(); else renderAuth();
    } catch (error) {
      app.innerHTML = `<div class="error-state"><h1>Recipe Keeper could not start</h1><p>${U.escapeHTML(readableError(error))}</p><button class="button button-primary" onclick="location.reload()">Reload</button></div>`;
    }
  }

  init();
})();
