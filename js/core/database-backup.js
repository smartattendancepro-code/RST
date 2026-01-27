
(function () {
    'use strict';

    console.log('🛡️ Database Backup System: Loading...');



    const CONFIG = {
        supabase: {
            url: 'https://ftmsfccgkgyufbgwzsnn.supabase.co',
            key: 'sb_publishable_1p0OGr6x8FBL8upcVBFB9w_Gkj6Vjl7'  // ✅ تم التصحيح
        },

        syncInterval: 30000,        
        maxRetries: 3,             
        healthCheckInterval: 60000, 

        criticalCollections: [
            'attendance',
            'active_sessions',
            'user_registrations'
        ]
    };


    let state = {
        firebase: {
            status: 'unknown',
            lastCheck: null,
            failCount: 0
        },
        supabase: {
            status: 'unknown',
            lastCheck: null,
            client: null
        },
        indexedDB: {
            status: 'unknown',
            db: null
        },
        pendingQueue: [],
        isBackupActive: false
    };


    async function init() {
        console.log('⚡ Initializing Backup System...');

        await waitForFirebase();

        await initSupabase();

        await initLocalDB();

        interceptFirebaseCalls();

        startHealthMonitoring();

        startAutoSync();

        console.log('✅ Backup System: Ready');

        displayStatus();
    }


    function waitForFirebase() {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (window.firebase && window.db) {
                    clearInterval(check);
                    console.log('✅ Firebase: Detected');
                    state.firebase.status = 'active';
                    resolve();
                }
            }, 100);

            setTimeout(() => {
                clearInterval(check);
                console.warn('⚠️ Firebase: Timeout');
                state.firebase.status = 'failed';
                resolve();
            }, 10000);
        });
    }

    async function initSupabase() {
        try {
            if (typeof supabase === 'undefined') {
                console.warn('⚠️ Supabase library not found. Loading from CDN...');
                await loadSupabaseFromCDN();
            }

            state.supabase.client = supabase.createClient(
                CONFIG.supabase.url,
                CONFIG.supabase.key
            );

            const { error } = await state.supabase.client
                .from('_health_check')
                .select('*')
                .limit(1);

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            state.supabase.status = 'active';
            console.log('✅ Supabase: Connected');

        } catch (error) {
            state.supabase.status = 'failed';
            console.error('❌ Supabase: Failed', error.message);
        }
    }

    function loadSupabaseFromCDN() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => {
                console.log('✅ Supabase library loaded');
                resolve();
            };
            script.onerror = () => {
                console.error('❌ Failed to load Supabase library');
                reject();
            };
            document.head.appendChild(script);
        });
    }

    function initLocalDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('BackupDB', 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // إنشاء المخازن
                if (!db.objectStoreNames.contains('pending_sync')) {
                    const store = db.createObjectStore('pending_sync', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('collection', 'collection', { unique: false });
                }

                if (!db.objectStoreNames.contains('backup_data')) {
                    db.createObjectStore('backup_data', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                }
            };

            request.onsuccess = () => {
                state.indexedDB.db = request.result;
                state.indexedDB.status = 'active';
                console.log('✅ IndexedDB: Connected');
                resolve();
            };

            request.onerror = () => {
                state.indexedDB.status = 'failed';
                console.error('❌ IndexedDB: Failed');
                reject(request.error);
            };
        });
    }

    function interceptFirebaseCalls() {
        if (!window.firebase || !window.db) {
            console.warn('⚠️ Cannot intercept: Firebase not found');
            return;
        }

        console.log('🎣 Intercepting Firebase calls...');

        const originalAdd = firebase.firestore.CollectionReference.prototype.add;
        firebase.firestore.CollectionReference.prototype.add = async function (data) {
            const collectionPath = this.path;

            try {
                const result = await originalAdd.call(this, data);
                console.log(`✅ Firebase: Saved to ${collectionPath}`);
                return result;

            } catch (error) {
                console.warn(`⚠️ Firebase failed: ${collectionPath}`, error.message);

                return await handleFailedWrite(collectionPath, data, 'add');
            }
        };

        const originalSet = firebase.firestore.DocumentReference.prototype.set;
        firebase.firestore.DocumentReference.prototype.set = async function (data, options) {
            const docPath = this.path;

            try {
                const result = await originalSet.call(this, data, options);
                console.log(`✅ Firebase: Updated ${docPath}`);
                return result;

            } catch (error) {
                console.warn(`⚠️ Firebase failed: ${docPath}`, error.message);
                return await handleFailedWrite(docPath, data, 'set', options);
            }
        };

        const originalUpdate = firebase.firestore.DocumentReference.prototype.update;
        firebase.firestore.DocumentReference.prototype.update = async function (data) {
            const docPath = this.path;

            try {
                const result = await originalUpdate.call(this, data);
                console.log(`✅ Firebase: Updated ${docPath}`);
                return result;

            } catch (error) {
                console.warn(`⚠️ Firebase failed: ${docPath}`, error.message);
                return await handleFailedWrite(docPath, data, 'update');
            }
        };

        console.log('✅ Interception active');
    }


    async function handleFailedWrite(path, data, operation, options = {}) {
        console.log(`🔄 Attempting backup for: ${path}`);

        state.firebase.failCount++;

        if (state.firebase.failCount >= 3) {
            state.firebase.status = 'failed';
            showUserNotification('⚠️ Firebase غير متاح - جاري استخدام النظام الاحتياطي');
        }

        if (state.supabase.status === 'active') {
            try {
                const result = await saveToSupabase(path, data, operation);

                await addToPendingSync({
                    path,
                    data,
                    operation,
                    options,
                    target: 'firebase',
                    source: 'supabase',
                    timestamp: Date.now()
                });

                showUserNotification('✅ تم الحفظ في النظام الاحتياطي');
                return result;

            } catch (supabaseError) {
                console.error('❌ Supabase also failed:', supabaseError.message);
            }
        }

        if (state.indexedDB.status === 'active') {
            try {
                const result = await saveToLocalDB(path, data, operation);

                await addToPendingSync({
                    path,
                    data,
                    operation,
                    options,
                    target: 'cloud',
                    source: 'local',
                    timestamp: Date.now()
                });

                showUserNotification('💾 تم الحفظ محلياً - سيتم الرفع لاحقاً', 'warning');
                return result;

            } catch (localError) {
                console.error('❌ Local storage failed:', localError.message);
            }
        }

        showUserNotification('❌ فشل الحفظ - يرجى المحاولة لاحقاً', 'error');
        throw new Error('All backup methods failed');
    }


    async function saveToSupabase(path, data, operation) {
        const parts = path.split('/');
        const collectionName = parts[0];

        const record = {
            ...data,
            _firebase_path: path,
            _operation: operation,
            _synced_at: new Date().toISOString()
        };

        if (operation === 'add') {
            const { data: inserted, error } = await state.supabase.client
                .from(collectionName)
                .insert([record])
                .select();

            if (error) throw error;

            return { id: inserted[0].id };

        } else if (operation === 'set' || operation === 'update') {
            const docId = parts[parts.length - 1];

            const { error } = await state.supabase.client
                .from(collectionName)
                .upsert({ id: docId, ...record });

            if (error) throw error;

            return { id: docId };
        }
    }

    function saveToLocalDB(path, data, operation) {
        return new Promise((resolve, reject) => {
            const transaction = state.indexedDB.db.transaction(['backup_data'], 'readwrite');
            const store = transaction.objectStore('backup_data');

            const record = {
                path,
                data,
                operation,
                timestamp: Date.now(),
                synced: false
            };

            const request = store.add(record);

            request.onsuccess = () => {
                resolve({ id: request.result });
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    function addToPendingSync(record) {
        return new Promise((resolve, reject) => {
            const transaction = state.indexedDB.db.transaction(['pending_sync'], 'readwrite');
            const store = transaction.objectStore('pending_sync');

            const request = store.add({
                ...record,
                attempts: 0,
                last_attempt: null
            });

            request.onsuccess = () => {
                state.pendingQueue.push(record);
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }


    function startAutoSync() {
        setInterval(async () => {
            if (state.firebase.status !== 'active') {
                return; 
            }

            const pending = await getPendingSync();

            if (pending.length === 0) return;

            console.log(`🔄 Syncing ${pending.length} pending records...`);

            for (const record of pending) {
                try {
                    await syncRecord(record);
                    await removePendingSync(record.id);
                    console.log(`✅ Synced: ${record.path}`);

                } catch (error) {
                    console.warn(`⚠️ Sync failed: ${record.path}`, error.message);
                    await incrementSyncAttempts(record.id);
                }
            }

        }, CONFIG.syncInterval);
    }

    function getPendingSync() {
        return new Promise((resolve, reject) => {
            const transaction = state.indexedDB.db.transaction(['pending_sync'], 'readonly');
            const store = transaction.objectStore('pending_sync');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function syncRecord(record) {
        const ref = firebase.firestore().doc(record.path);

        if (record.operation === 'add') {
            const collection = firebase.firestore().collection(record.path.split('/')[0]);
            await collection.add(record.data);

        } else if (record.operation === 'set') {
            await ref.set(record.data, record.options || {});

        } else if (record.operation === 'update') {
            await ref.update(record.data);
        }
    }

    function removePendingSync(id) {
        return new Promise((resolve, reject) => {
            const transaction = state.indexedDB.db.transaction(['pending_sync'], 'readwrite');
            const store = transaction.objectStore('pending_sync');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    function incrementSyncAttempts(id) {
        return new Promise((resolve, reject) => {
            const transaction = state.indexedDB.db.transaction(['pending_sync'], 'readwrite');
            const store = transaction.objectStore('pending_sync');

            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const record = getRequest.result;
                record.attempts++;
                record.last_attempt = Date.now();

                const updateRequest = store.put(record);
                updateRequest.onsuccess = () => resolve();
                updateRequest.onerror = () => reject(updateRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }


    function startHealthMonitoring() {
        setInterval(async () => {
            await checkFirebaseHealth();
            await checkSupabaseHealth();

            state.firebase.lastCheck = Date.now();
            state.supabase.lastCheck = Date.now();

        }, CONFIG.healthCheckInterval);
    }

    async function checkFirebaseHealth() {
        try {
            const testRef = firebase.firestore().collection('_health').doc('test');
            await testRef.set({ timestamp: Date.now() }, { merge: true });

            if (state.firebase.status === 'failed') {
                console.log('🎉 Firebase: Recovered!');
                showUserNotification('✅ تم استعادة الاتصال بـ Firebase');
                state.firebase.failCount = 0;
            }

            state.firebase.status = 'active';

        } catch (error) {
            state.firebase.status = 'failed';
        }
    }

    async function checkSupabaseHealth() {
        if (!state.supabase.client) return;

        try {
            const { error } = await state.supabase.client
                .from('_health_check')
                .select('*')
                .limit(1);

            if (error && error.code !== 'PGRST116') throw error;

            state.supabase.status = 'active';

        } catch (error) {
            state.supabase.status = 'failed';
        }
    }


    function showUserNotification(message, type = 'info') {
        if (typeof showToast === 'function') {
            const colors = {
                info: '#0ea5e9',
                warning: '#f59e0b',
                error: '#ef4444',
                success: '#10b981'
            };

            showToast(message, 3000, colors[type] || colors.info);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    function displayStatus() {
        const getIcon = (status) => {
            return status === 'active' ? '✅' :
                status === 'failed' ? '❌' : '⏳';
        };

        console.log(`

║   🛡️ DATABASE BACKUP SYSTEM - STATUS      
║  Firebase:   ${getIcon(state.firebase.status)} ${state.firebase.status.toUpperCase().padEnd(20)} ║
║  Supabase:   ${getIcon(state.supabase.status)} ${state.supabase.status.toUpperCase().padEnd(20)} ║
║  IndexedDB:  ${getIcon(state.indexedDB.status)} ${state.indexedDB.status.toUpperCase().padEnd(20)} ║
║  Pending Sync: ${state.pendingQueue.length.toString().padEnd(26)} ║
    `);
    }

    window.BackupSystem = {
        getStatus: () => state,
        forceSync: () => startAutoSync(),
        displayStatus: displayStatus,
        disable: () => {
            state.isBackupActive = false;
            console.log('🛑 Backup System: Disabled');
        },
        enable: () => {
            state.isBackupActive = true;
            console.log('✅ Backup System: Enabled');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();