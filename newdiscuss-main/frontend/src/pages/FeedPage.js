import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getPosts, getTrendingHashtags, subscribeToPostsRealtime } from '@/lib/db';
import { searchUsers } from '@/lib/relationshipsDb';
import { 
  getCachedPosts, 
  cachePosts, 
  isCacheValid, 
  CACHE_DURATION 
} from '@/lib/cacheManager';
import Header from '@/components/Header';
import PostCard from '@/components/PostCard';
import CreatePostModal from '@/components/CreatePostModal';
import LoadingScreen from '@/components/LoadingScreen';
import UserSearchResult from '@/components/UserSearchResult';
import SignalStoriesRow from '@/components/SignalStoriesRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, MessageSquare, FolderGit2, WifiOff, Loader2, Search, X, Hash, TrendingUp, Users } from 'lucide-react';

const MemoPostCard = memo(PostCard);

export default function FeedPage() {
  const { user } = useAuth();
  const [allPosts, setAllPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [trendingTags, setTrendingTags] = useState([]);
  const [activeTab, setActiveTab] = useState('discussion');
  const [searchType, setSearchType] = useState('posts'); // 'posts' or 'users'
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  // Load cached posts first for instant display, then fetch fresh data
  useEffect(() => {
    const loadWithCache = async () => {
      try {
        // Try to get cached posts first
        const cachedData = await getCachedPosts();
        if (cachedData && cachedData.length > 0) {
          setAllPosts(cachedData);
          setLoading(false);
          setLoadedFromCache(true);
        }
        
        // Check if cache is still valid
        const isValid = await isCacheValid('posts', CACHE_DURATION.POSTS);
        
        // If cache is invalid or empty, fetch fresh data
        if (!isValid || !cachedData || cachedData.length === 0) {
          const freshData = await getPosts();
          setAllPosts(freshData);
          await cachePosts(freshData);
          setLoadedFromCache(false);
        }
      } catch (err) {
        console.error('Cache/fetch error:', err);
        // Fallback to direct fetch
        try {
          const data = await getPosts();
          setAllPosts(data);
          await cachePosts(data);
        } catch (fetchErr) {
          console.error('Failed to fetch posts:', fetchErr);
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadWithCache();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search users when search type is 'users'
  useEffect(() => {
    if (searchType !== 'users' || !debouncedSearch.trim() || !user?.id) {
      setUserSearchResults([]);
      return;
    }

    const searchForUsers = async () => {
      setSearchingUsers(true);
      try {
        const results = await searchUsers(debouncedSearch, user.id);
        setUserSearchResults(results);
      } catch (error) {
        console.error('User search error:', error);
      } finally {
        setSearchingUsers(false);
      }
    };

    searchForUsers();
  }, [debouncedSearch, searchType, user?.id]);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await getPosts();
      setAllPosts(data);
      // Cache the fresh data
      await cachePosts(data);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrendingTags = useCallback(async () => {
    try {
      const tags = await getTrendingHashtags();
      setTrendingTags(tags);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPosts();
    fetchTrendingTags();
  }, [fetchPosts, fetchTrendingTags]);

  // Firebase real-time listener
  useEffect(() => {
    const unsubscribe = subscribeToPostsRealtime(async (updatedPosts) => {
      setAllPosts(updatedPosts);
      setLoading(false);
      setLoadedFromCache(false);
      // Update cache with fresh data
      await cachePosts(updatedPosts);
      fetchTrendingTags();
    });
    return () => unsubscribe();
  }, [fetchTrendingTags]);

  useEffect(() => {
    const handleOnline = () => { setIsOffline(false); fetchPosts(); };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchPosts]);

  // Client-side fast filtering: by tab AND search query
  const filteredPosts = useMemo(() => {
    let posts = allPosts.filter(p => p.type === activeTab);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase().trim();
      posts = posts.filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.content?.toLowerCase().includes(q) ||
        p.author_username?.toLowerCase().includes(q) ||
        (p.hashtags || []).some(t => t.toLowerCase().includes(q.replace('#', '')))
      );
    }
    return posts;
  }, [allPosts, activeTab, debouncedSearch]);

  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setUserSearchResults([]);
  };

  const handleTagClick = (tag) => {
    setSearchQuery(tag);
  };

  const handlePostCreated = () => {
    setShowCreate(false);
    fetchTrendingTags();
  };

  const handlePostDeleted = useCallback((postId) => {
    setAllPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const handlePostUpdated = useCallback((updatedPost) => {
    setAllPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
  }, []);

  const handleVoteChanged = useCallback((postId, voteData) => {
    setAllPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, upvote_count: voteData.upvote_count, downvote_count: voteData.downvote_count, votes: voteData.votes } : p
      )
    );
  }, []);

  if (pageLoading) {
    return <LoadingScreen message="Loading your feed..." />;
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 discuss:bg-[#121212]">
      <Header />
      
      {isOffline && (
        <div data-testid="offline-banner" className="bg-[#F59E0B]/10 border-b border-[#F59E0B]/20 py-2 px-4 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 text-[#F59E0B]" />
          <span className="text-[#F59E0B] text-[13px] font-medium">You're offline. Showing cached content.</span>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 md:px-8 py-6">
        {/* Header + Create */}
        <div className="flex items-center justify-between mb-4">
          <h1 data-testid="feed-title" className="font-heading text-xl sm:text-2xl font-bold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5]">Feed</h1>
          <Button
            data-testid="create-post-btn"
            onClick={() => setShowCreate(true)}
            className="bg-[#2563EB] text-white hover:bg-[#1D4ED8] discuss:bg-[#EF4444] discuss:hover:bg-[#DC2626] rounded-[6px] px-4 py-2 font-medium shadow-button hover:shadow-button-hover transition-all"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Post
          </Button>
        </div>

        {/* Signal Stories Row */}
        <SignalStoriesRow />

        {/* Tabs */}
        <div data-testid="feed-tabs" className="flex mb-4 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] p-1 border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] shadow-card">
          <button
            data-testid="tab-discussion"
            onClick={() => setActiveTab('discussion')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[6px] text-[13px] font-semibold transition-all ${
              activeTab === 'discussion'
                ? 'bg-[#2563EB] discuss:bg-[#EF4444] text-white shadow-button'
                : 'text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626]'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Discussions
          </button>
          <button
            data-testid="tab-project"
            onClick={() => setActiveTab('project')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[6px] text-[13px] font-semibold transition-all ${
              activeTab === 'project'
                ? 'bg-[#6275AF] discuss:bg-[#EF4444] text-white shadow-button'
                : 'text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626]'
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
            Project Posts
          </button>
        </div>

        {/* Search bar */}
        <div className="mb-4">
          {/* Search type toggle */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => { setSearchType('posts'); setUserSearchResults([]); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-all ${
                searchType === 'posts'
                  ? 'bg-[#2563EB] discuss:bg-[#EF4444] text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 discuss:bg-[#1a1a1a] text-neutral-600 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:bg-neutral-200 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626]'
              }`}
            >
              <Hash className="w-3 h-3" />
              Posts
            </button>
            <button
              onClick={() => setSearchType('users')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-all ${
                searchType === 'users'
                  ? 'bg-[#2563EB] discuss:bg-[#EF4444] text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 discuss:bg-[#1a1a1a] text-neutral-600 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:bg-neutral-200 dark:hover:bg-neutral-700 discuss:hover:bg-[#262626]'
              }`}
            >
              <Users className="w-3 h-3" />
              Users
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF]" />
            <Input
              data-testid="feed-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchType === 'users' ? 'Search users by username...' : `Search ${activeTab === 'discussion' ? 'discussions' : 'projects'}...`}
              className="pl-10 pr-10 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] placeholder:text-neutral-400 dark:placeholder:text-neutral-500 discuss:placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 rounded-[6px] text-[13px] md:text-[15px] h-10"
            />
            {searchQuery && (
              <button
                type="button"
                data-testid="feed-search-clear"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white discuss:hover:text-[#F5F5F5]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* User Search Results */}
        {searchType === 'users' && debouncedSearch && (
          <div className="mb-4">
            {searchingUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#2563EB] discuss:text-[#EF4444]" />
              </div>
            ) : userSearchResults.length > 0 ? (
              <div className="space-y-2">
                <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-xs mb-2">
                  {userSearchResults.length} user{userSearchResults.length !== 1 ? 's' : ''} found
                </p>
                {userSearchResults.map((searchUser) => (
                  <UserSearchResult
                    key={searchUser.id}
                    user={searchUser}
                    currentUserId={user?.id}
                    onClose={() => {}}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] rounded-[12px] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] shadow-card">
                <Users className="w-8 h-8 text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF] mx-auto mb-2" />
                <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm">
                  No users found for "{debouncedSearch}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Active search indicator for posts */}
        {searchType === 'posts' && debouncedSearch && (
          <div data-testid="active-search-badge" className="flex items-center gap-2 mb-4 bg-[#2563EB]/10 dark:bg-[#2563EB]/15 border border-[#2563EB]/20 dark:border-[#2563EB]/30 rounded-[6px] px-3 py-2">
            <Search className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="text-[#2563EB] text-[13px] font-medium">
              {filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''} for "{debouncedSearch}" in {activeTab === 'discussion' ? 'Discussions' : 'Projects'}
            </span>
            <button onClick={handleClearSearch} className="ml-auto text-[#2563EB] hover:text-[#1D4ED8]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Trending hashtags - only show when not searching users */}
        {searchType === 'posts' && trendingTags.length > 0 && !debouncedSearch && (
          <div data-testid="trending-tags" className="mb-5">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF]" />
              <span className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-xs font-semibold uppercase tracking-wider">Trending</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {trendingTags.slice(0, 4).map((t) => (
                <button
                  key={t.tag}
                  data-testid={`trending-tag-${t.tag}`}
                  onClick={() => handleTagClick(t.tag)}
                  className="inline-flex items-center gap-1 bg-white dark:bg-neutral-800 discuss:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 discuss:border-[#333333] hover:border-[#2563EB]/30 hover:bg-[#2563EB]/5 dark:hover:bg-[#2563EB]/10 rounded-[6px] px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 discuss:text-[#9CA3AF] hover:text-[#2563EB] transition-all shadow-card"
                >
                  <Hash className="w-3 h-3" />
                  {t.tag}
                  <span className="text-[10px] opacity-60">({t.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Posts - only show when not searching users */}
        {searchType === 'posts' && (
          loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#2563EB] discuss:text-[#EF4444] mb-2" />
            <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-sm">Loading posts...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div data-testid="empty-feed" className="text-center py-20">
            <div className="w-16 h-16 rounded-[12px] bg-neutral-100 dark:bg-neutral-800 discuss:bg-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
              {activeTab === 'discussion' ? (
                <MessageSquare className="w-7 h-7 text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF]" />
              ) : (
                <FolderGit2 className="w-7 h-7 text-neutral-400 dark:text-neutral-500 discuss:text-[#9CA3AF]" />
              )}
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 discuss:text-[#F5F5F5] mb-1">
              {debouncedSearch ? 'No results found' : `No ${activeTab === 'discussion' ? 'discussions' : 'projects'} yet`}
            </h3>
            <p className="text-neutral-500 dark:text-neutral-400 discuss:text-[#9CA3AF] text-[13px] md:text-[15px]">
              {debouncedSearch ? `Try a different search term` : `Be the first to start a ${activeTab === 'discussion' ? 'discussion' : 'project post'}!`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <MemoPostCard
                key={post.id}
                post={post}
                currentUser={user}
                onDeleted={handlePostDeleted}
                onUpdated={handlePostUpdated}
                onVoteChanged={handleVoteChanged}
                onTagClick={handleTagClick}
              />
            ))}
          </div>
        )
        )}
      </div>

      <CreatePostModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handlePostCreated}
      />
    </div>
  );
}
