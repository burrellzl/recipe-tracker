(function () {
  'use strict';

  const config = window.RECIPE_APP_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.co\/?$/i.test(config.supabaseUrl || '') &&
    !String(config.supabaseAnonKey || '').startsWith('YOUR_');
  let client = null;

  function requireClient() {
    if (!client) throw new Error('Supabase has not been connected yet.');
    return client;
  }

  function initialize() {
    if (!configured) return null;
    if (!window.supabase?.createClient) throw new Error('The Supabase library did not load. Refresh the page and try again.');
    client = window.supabase.createClient(config.supabaseUrl.replace(/\/$/, ''), config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return client;
  }

  async function getSession() {
    const { data, error } = await requireClient().auth.getSession();
    if (error) throw error;
    return data.session;
  }

  function onAuthStateChange(callback) {
    return requireClient().auth.onAuthStateChange(callback);
  }

  async function signIn(email, password) {
    const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password) {
    const redirectTo = `${location.origin}${location.pathname}`;
    const { data, error } = await requireClient().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
  }

  function normalizeRecipe(recipe) {
    return {
      ...recipe,
      ingredients: [...(recipe.ingredients || [])].sort((a, b) => a.position - b.position),
      directions: [...(recipe.directions || [])].sort((a, b) => a.position - b.position)
    };
  }

  async function signedImageUrl(path) {
    if (!path) return null;
    const { data, error } = await requireClient().storage.from('recipe-images').createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  }

  async function addImageUrls(recipes) {
    return Promise.all(recipes.map(async (recipe) => ({
      ...normalizeRecipe(recipe),
      image_url: await signedImageUrl(recipe.image_path)
    })));
  }

  async function loadRecipes() {
    const { data, error } = await requireClient()
      .from('recipes')
      .select('*, ingredients(*), directions(*)')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return addImageUrls(data || []);
  }

  async function loadRecipe(id) {
    const { data, error } = await requireClient()
      .from('recipes')
      .select('*, ingredients(*), directions(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return (await addImageUrls([data]))[0];
  }

  async function saveRecipe(recipeId, payload, ingredients, directions) {
    const { data, error } = await requireClient().rpc('save_recipe', {
      p_payload: payload,
      p_ingredients: ingredients,
      p_directions: directions,
      p_recipe_id: recipeId || null
    });
    if (error) throw error;
    return data;
  }

  async function deleteRecipe(id) {
    const { error } = await requireClient().from('recipes').delete().eq('id', id);
    if (error) throw error;
  }

  async function uploadImage(blob, userId) {
    const path = `${userId}/${RecipeUtils.makeId()}.jpg`;
    const { error } = await requireClient().storage.from('recipe-images').upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
      cacheControl: '3600'
    });
    if (error) throw error;
    return path;
  }

  async function copyImage(path, userId) {
    if (!path) return null;
    const newPath = `${userId}/${RecipeUtils.makeId()}.jpg`;
    const { error } = await requireClient().storage.from('recipe-images').copy(path, newPath);
    if (error) return null;
    return newPath;
  }

  async function removeImageIfUnused(path) {
    if (!path) return;
    const { data, error } = await requireClient().from('recipes').select('id').eq('image_path', path).limit(1);
    if (error || data?.length) return;
    await requireClient().storage.from('recipe-images').remove([path]);
  }

  window.RecipeDB = Object.freeze({
    configured,
    initialize,
    getSession,
    onAuthStateChange,
    signIn,
    signUp,
    signOut,
    loadRecipes,
    loadRecipe,
    saveRecipe,
    deleteRecipe,
    uploadImage,
    copyImage,
    removeImageIfUnused
  });
})();
