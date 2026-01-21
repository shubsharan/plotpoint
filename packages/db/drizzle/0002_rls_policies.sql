-- ============================================
-- Row Level Security (RLS) Policies
-- Apply these in Supabase SQL editor or as a migration
-- ============================================

-- ============================================
-- STORIES TABLE
-- ============================================
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Anyone can read published stories
CREATE POLICY "Published stories are public"
ON stories FOR SELECT
USING (status = 'published');

-- Authors can read their own drafts
CREATE POLICY "Authors can read own drafts"
ON stories FOR SELECT
USING (author_id = auth.uid());

-- Authors can create stories
CREATE POLICY "Authors can create stories"
ON stories FOR INSERT
WITH CHECK (author_id = auth.uid());

-- Authors can update their own stories
CREATE POLICY "Authors can modify own stories"
ON stories FOR UPDATE
USING (author_id = auth.uid());

-- Authors can delete their own stories
CREATE POLICY "Authors can delete own stories"
ON stories FOR DELETE
USING (author_id = auth.uid());

-- ============================================
-- NODES TABLE
-- ============================================
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;

-- Nodes readable if parent story is readable
CREATE POLICY "Nodes follow story visibility"
ON nodes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = nodes.story_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can modify nodes in their stories
CREATE POLICY "Authors can modify own story nodes"
ON nodes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = nodes.story_id
    AND s.author_id = auth.uid()
  )
);

-- ============================================
-- STORY ASSETS TABLE
-- ============================================
ALTER TABLE story_assets ENABLE ROW LEVEL SECURITY;

-- Assets follow story visibility
CREATE POLICY "Assets follow story visibility"
ON story_assets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = story_assets.story_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can manage their story assets
CREATE POLICY "Authors can manage own story assets"
ON story_assets FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = story_assets.story_id
    AND s.author_id = auth.uid()
  )
);

-- ============================================
-- EDGES TABLE
-- ============================================
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;

-- Edges follow story visibility (through source node)
CREATE POLICY "Edges follow story visibility"
ON edges FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM nodes n
    JOIN stories s ON s.id = n.story_id
    WHERE n.id = edges.source_node_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can modify edges in their stories
CREATE POLICY "Authors can modify own story edges"
ON edges FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM nodes n
    JOIN stories s ON s.id = n.story_id
    WHERE n.id = edges.source_node_id
    AND s.author_id = auth.uid()
  )
);

-- ============================================
-- STORY SESSIONS TABLE
-- ============================================
ALTER TABLE story_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own sessions
CREATE POLICY "Users own their sessions"
ON story_sessions FOR ALL
USING (user_id = auth.uid());

-- ============================================
-- MULTIPLAYER SESSIONS TABLE
-- ============================================
ALTER TABLE multiplayer_sessions ENABLE ROW LEVEL SECURITY;

-- Players can read sessions they're in
CREATE POLICY "Players can read their sessions"
ON multiplayer_sessions FOR SELECT
USING (
  host_user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM multiplayer_players mp
    WHERE mp.session_id = multiplayer_sessions.id
    AND mp.user_id = auth.uid()
  )
);

-- Host can modify session
CREATE POLICY "Host can modify session"
ON multiplayer_sessions FOR UPDATE
USING (host_user_id = auth.uid());

-- Host can delete session
CREATE POLICY "Host can delete session"
ON multiplayer_sessions FOR DELETE
USING (host_user_id = auth.uid());

-- Users can create sessions (they become host)
CREATE POLICY "Users can create sessions"
ON multiplayer_sessions FOR INSERT
WITH CHECK (host_user_id = auth.uid());

-- ============================================
-- MULTIPLAYER PLAYERS TABLE
-- ============================================
ALTER TABLE multiplayer_players ENABLE ROW LEVEL SECURITY;

-- Players can read player info in their sessions
CREATE POLICY "Players can read session players"
ON multiplayer_players FOR SELECT
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM multiplayer_sessions ms
    WHERE ms.id = multiplayer_players.session_id
    AND (
      ms.host_user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM multiplayer_players mp2
        WHERE mp2.session_id = ms.id
        AND mp2.user_id = auth.uid()
      )
    )
  )
);

-- Users can update their own player record
CREATE POLICY "Users can update own player record"
ON multiplayer_players FOR UPDATE
USING (user_id = auth.uid());

-- Users can join sessions (insert their player record)
CREATE POLICY "Users can join sessions"
ON multiplayer_players FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can leave sessions (delete their player record)
CREATE POLICY "Users can leave sessions"
ON multiplayer_players FOR DELETE
USING (user_id = auth.uid());

-- ============================================
-- CHAPTERS TABLE
-- ============================================
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

-- Chapters follow story visibility
CREATE POLICY "Chapters follow story visibility"
ON chapters FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = chapters.story_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can modify chapters in their stories
CREATE POLICY "Authors can modify own story chapters"
ON chapters FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = chapters.story_id
    AND s.author_id = auth.uid()
  )
);

-- ============================================
-- STORY ROLES TABLE
-- ============================================
ALTER TABLE story_roles ENABLE ROW LEVEL SECURITY;

-- Roles follow story visibility
CREATE POLICY "Roles follow story visibility"
ON story_roles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = story_roles.story_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can modify roles in their stories
CREATE POLICY "Authors can modify own story roles"
ON story_roles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = story_roles.story_id
    AND s.author_id = auth.uid()
  )
);

-- ============================================
-- SYNC POINTS TABLE
-- ============================================
ALTER TABLE sync_points ENABLE ROW LEVEL SECURITY;

-- Sync points follow story visibility
CREATE POLICY "Sync points follow story visibility"
ON sync_points FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = sync_points.story_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can modify sync points in their stories
CREATE POLICY "Authors can modify own story sync points"
ON sync_points FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = sync_points.story_id
    AND s.author_id = auth.uid()
  )
);

-- ============================================
-- STORY MANIFESTS TABLE
-- ============================================
ALTER TABLE story_manifests ENABLE ROW LEVEL SECURITY;

-- Manifests follow story visibility
CREATE POLICY "Manifests follow story visibility"
ON story_manifests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = story_manifests.story_id
    AND (s.status = 'published' OR s.author_id = auth.uid())
  )
);

-- Authors can modify manifests in their stories
CREATE POLICY "Authors can modify own story manifests"
ON story_manifests FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = story_manifests.story_id
    AND s.author_id = auth.uid()
  )
);

-- ============================================
-- STORY DOWNLOADS TABLE
-- ============================================
ALTER TABLE story_downloads ENABLE ROW LEVEL SECURITY;

-- Users can only access their own downloads
CREATE POLICY "Users own their downloads"
ON story_downloads FOR ALL
USING (user_id = auth.uid());

-- ============================================
-- PROFILES TABLE
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Public profiles are readable by everyone
CREATE POLICY "Public profiles are visible"
ON profiles FOR SELECT
USING (is_public = true OR id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (id = auth.uid());

-- Profiles are created via trigger (from auth.users)
-- If manual creation is needed:
CREATE POLICY "Users can create own profile"
ON profiles FOR INSERT
WITH CHECK (id = auth.uid());

-- ============================================
-- USER ACHIEVEMENTS TABLE
-- ============================================
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Users can read their own achievements
CREATE POLICY "Users can read own achievements"
ON user_achievements FOR SELECT
USING (user_id = auth.uid());

-- System inserts achievements (via service role)
-- No user insert policy needed

-- ============================================
-- EVENTS TABLE (Analytics)
-- ============================================
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Users can read their own events
CREATE POLICY "Users can read own events"
ON events FOR SELECT
USING (user_id = auth.uid());

-- Users can insert their own events
CREATE POLICY "Users can create own events"
ON events FOR INSERT
WITH CHECK (user_id = auth.uid());

-- ============================================
-- REFERENCE TABLES (Public Read)
-- ============================================

-- Genres are public
ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Genres are public"
ON genres FOR SELECT
USING (true);

-- Achievements are public
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Achievements are public"
ON achievements FOR SELECT
USING (true);

-- Venue categories are public
ALTER TABLE venue_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venue categories are public"
ON venue_categories FOR SELECT
USING (true);

-- Venues are public
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Venues are public"
ON venues FOR SELECT
USING (true);

-- Component types are public
ALTER TABLE component_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Component types are public"
ON component_types FOR SELECT
USING (true);

-- Component versions are public
ALTER TABLE component_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Component versions are public"
ON component_versions FOR SELECT
USING (true);
