import logging
import os
    
from assemblyline.common import version
from assemblyline.common.logformat import AL_LOG_FORMAT
from assemblyline.common import forge, log as al_log
from assemblyline.remote.datatypes.counters import Counters
from assemblyline.remote.datatypes.hash import Hash
from assemblyline.remote.datatypes.set import ExpiringSet

config = forge.get_config()
    
#################################################################
# Configuration

CLASSIFICATION = forge.get_classification()

ALLOW_RAW_DOWNLOADS = config.ui.allow_raw_downloads
APP_ID = "https://%s" % config.ui.fqdn
APP_NAME = "Assemblyline"
AUDIT = config.ui.audit

SECRET_KEY = config.ui.secret_key
DEBUG = config.ui.debug
DOWNLOAD_ENCODING = config.ui.download_encoding
MAX_CLASSIFICATION = CLASSIFICATION.UNRESTRICTED
ORGANISATION = config.system.organisation
SYSTEM_TYPE = config.system.type

BUILD_MASTER = version.FRAMEWORK_VERSION
BUILD_LOWER = version.SYSTEM_VERSION
BUILD_NO = version.BUILD_MINOR

BUNDLING_DIR = "/var/lib/assemblyline/bundling"

F_READ_CHUNK_SIZE = 1024 * 1024

TEMP_DIR_CHUNKED = "/var/lib/assemblyline/flowjs/chunked/"
TEMP_DIR = "/var/lib/assemblyline/flowjs/full/"
TEMP_SUBMIT_DIR = "/var/lib/assemblyline/submit/"

RATE_LIMITER = Counters(prefix="quota",
                        host=config.core.redis.nonpersistent.host,
                        port=config.core.redis.nonpersistent.port,
                        track_counters=True)

KV_SESSION = Hash("flask_sessions",
                  host=config.core.redis.nonpersistent.host,
                  port=config.core.redis.nonpersistent.port)


def get_token_store(key):
    return ExpiringSet(f"oauth_token_{key}",
                       host=config.core.redis.nonpersistent.host,
                       port=config.core.redis.nonpersistent.port,
                       ttl=60 * 2)


def get_reset_queue(key):
    return ExpiringSet(f"reset_id_{key}",
                       host=config.core.redis.nonpersistent.host,
                       port=config.core.redis.nonpersistent.port,
                       ttl=60 * 15)


def get_signup_queue(key):
    return ExpiringSet(f"signup_id_{key}",
                       host=config.core.redis.nonpersistent.host,
                       port=config.core.redis.nonpersistent.port,
                       ttl=60 * 15)


# End of Configuration
#################################################################

#################################################################
# Prepare loggers
config.logging.log_to_console = config.logging.log_to_console or DEBUG
al_log.init_logging("ui", config=config)

AUDIT_KW_TARGET = ["sid",
                   "sha256",
                   "copy_sid",
                   "filter",
                   "query",
                   "username",
                   "group",
                   "rev",
                   "wq_id",
                   "bucket",
                   "cache_key",
                   "alert_key",
                   "alert_id",
                   "url",
                   "q",
                   "fq",
                   "file_hash",
                   "heuristic_id",
                   "error_key",
                   "mac",
                   "vm_type",
                   "vm_name",
                   "config_name",
                   "servicename",
                   "vm"]

AUDIT_LOG = logging.getLogger('assemblyline.ui.audit')
LOGGER = logging.getLogger('assemblyline.ui')

if DEBUG:
    if not os.path.exists(config.logging.log_directory):
        os.makedirs(config.logging.log_directory)

    fh = logging.FileHandler(os.path.join(config.logging.log_directory, 'alui_audit.log'))
    fh.setLevel(logging.INFO)
    fh.setFormatter(logging.Formatter(AL_LOG_FORMAT))
    AUDIT_LOG.addHandler(fh)

AUDIT_LOG.debug('Audit logger ready!')
LOGGER.debug('Logger ready!')
    
# End of prepare logger
#################################################################

#################################################################
# Global instances
STORAGE = forge.get_datastore(archive_access=True)
# End global
#################################################################
