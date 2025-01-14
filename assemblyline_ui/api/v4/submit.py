
import json
import os
import shutil

from flask import request

from assemblyline.common.dict_utils import flatten
from assemblyline_ui.api.base import api_login, make_api_response, make_subapi_blueprint
from assemblyline_ui.config import STORAGE, TEMP_SUBMIT_DIR
from assemblyline_ui.helper.service import ui_to_submission_params
from assemblyline_ui.helper.submission import safe_download, FileTooBigException, InvalidUrlException, ForbiddenLocation
from assemblyline_ui.helper.user import check_submission_quota, get_default_user_settings
from assemblyline.common import forge
from assemblyline.common.uid import get_random_id
from assemblyline.odm.messages.submission import Submission
from assemblyline_core.submission_client import SubmissionClient, SubmissionException

Classification = forge.get_classification()
config = forge.get_config()

SUB_API = 'submit'
submit_api = make_subapi_blueprint(SUB_API, api_version=4)
submit_api._doc = "Submit files to the system"


# noinspection PyUnusedLocal
@submit_api.route("/dynamic/<sha256>/", methods=["GET"])
@api_login(required_priv=['W'], allow_readonly=False)
def resubmit_for_dynamic(sha256, *args, **kwargs):
    """
    Resubmit a file for dynamic analysis
    
    Variables:
    sha256         => Resource locator (SHA256)
    
    Arguments (Optional): 
    copy_sid    => Mimic the attributes of this SID.
    name        => Name of the file for the submission
    
    Data Block:
    None
    
    Result example:
    # Submission message object as a json dictionary
    """
    user = kwargs['user']
    copy_sid = request.args.get('copy_sid', None)
    name = request.args.get('name', sha256)
    
    if copy_sid:
        submission = STORAGE.submission.get(copy_sid, as_obj=False)
    else:
        submission = None
        
    if submission:
        if not Classification.is_accessible(user['classification'], submission['classification']):
            return make_api_response("", "You are not allowed to re-submit a submission that you don't have access to",
                                     403)

        submission_params = submission['params']
        submission_params['classification'] = submission['classification']
        
    else:
        submission_params = ui_to_submission_params(STORAGE.user_settings.get(user['uname'], as_obj=False))

    with forge.get_filestore() as f_transport:
        if not f_transport.exists(sha256):
            return make_api_response({}, "File %s cannot be found on the server therefore it cannot be resubmitted."
                                         % sha256, status_code=404)

        files = [{'name': name, 'sha256': sha256}]

        submission_params['submitter'] = user['uname']
        if 'priority' not in submission_params:
            submission_params['priority'] = 500
        submission_params['description'] = "Resubmit %s for Dynamic Analysis" % name
        if "Dynamic Analysis" not in submission_params['services']['selected']:
            submission_params['services']['selected'].append("Dynamic Analysis")

        try:
            submission_obj = Submission({
                "files": files,
                "params": submission_params
            })
        except (ValueError, KeyError) as e:
            return make_api_response("", err=str(e), status_code=400)

        try:
            submit_result = SubmissionClient(datastore=STORAGE, filestore=f_transport,
                                             config=config).submit(submission_obj)
        except SubmissionException as e:
            return make_api_response("", err=str(e), status_code=400)

    return make_api_response(submit_result.as_primitives())


# noinspection PyUnusedLocal
@submit_api.route("/resubmit/<sid>/", methods=["GET"])
@api_login(required_priv=['W'], allow_readonly=False)
def resubmit_submission_for_analysis(sid, *args, **kwargs):
    """
    Resubmit a submission for analysis with the exact same parameters as before

    Variables:
    sid         => Submission ID to re-submit

    Arguments:
    None

    Data Block:
    None

    Result example:
    # Submission message object as a json dictionary
    """
    user = kwargs['user']
    submission = STORAGE.submission.get(sid, as_obj=False)

    if submission:
        if not Classification.is_accessible(user['classification'], submission['classification']):
            return make_api_response("", "You are not allowed to re-submit a submission that you don't have access to",
                                     403)

        submission_params = submission['params']
        submission_params['classification'] = submission['classification']
    else:
        return make_api_response({}, "Submission %s does not exists." % sid, status_code=404)

    submission_params['submitter'] = user['uname']
    submission_params['description'] = "Resubmit %s for analysis" % ", ".join([x['name'] for x in submission["files"]])

    try:
        submission_obj = Submission({
            "files": submission["files"],
            "params": submission_params
        })
    except (ValueError, KeyError) as e:
        return make_api_response("", err=str(e), status_code=400)

    with forge.get_filestore() as f_transport:
        try:
            submit_result = SubmissionClient(datastore=STORAGE, filestore=f_transport,
                                             config=config).submit(submission_obj)
        except SubmissionException as e:
            return make_api_response("", err=str(e), status_code=400)

    return make_api_response(submit_result.as_primitives())


# noinspection PyBroadException
@submit_api.route("/", methods=["POST"])
@api_login(audit=False, required_priv=['W'], allow_readonly=False)
def submit(**kwargs):
    """
    Submit a single file, sha256 or url for analysis

        Note 1:
            If you are submitting a sh256 or a URL, you must use the application/json encoding and one of
            sha256 or url parameters must be included in the data block.

        Note 2:
            If you are submitting a file directly, you have to use multipart/form-data encoding this
            was done to reduce the memory footprint and speedup file transfers
             ** Read documentation of mime multipart standard if your library does not support it**

            The multipart/form-data for sending binary has two parts:
                - The first part contains a JSON dump of the optional params and uses the name 'json'
                - The last part conatins the file binary, uses the name 'bin' and includes a filename

    Variables:
    None
    
    Arguments: 
    None
    
    Data Block (SHA256 or URL):
    {
      // REQUIRED: One of the two following
      "sha256": "123...DEF",      # SHA256 hash of the file already in the datastore
      "url": "http://...",        # Url to fetch the file from

      // OPTIONAL VALUES
      "name": "file.exe",         # Name of the file to scan otherwise the sha256 or base file of the url

      "metadata": {               # Submission metadata
        "key": val,                 # Key/Value pair metadata values
      },

      "params": {                 # Submission parameters
        "key": val,                 # Key/Value pair for params that different then defaults
      },                            # Default params can be fetch at /api/v3/user/submission_params/<user>/
    }

    Data Block (Binary):

    --0b34a3c50d3c02dd804a172329a0b2aa               <-- Randomly generated boundary for this http request
    Content-Disposition: form-data; name="json"      <-- JSON data blob part (only previous optional values valid)

    {"metadata": {"hello": "world"}}
    --0b34a3c50d3c02dd804a172329a0b2aa               <-- Switch to next part, file part
    Content-Disposition: form-data; name="bin"; filename="name_of_the_file_to_scan.bin"

    <BINARY DATA OF THE FILE TO SCAN... DOES NOT NEED TO BE ENCODDED>

    --0b34a3c50d3c02dd804a172329a0b2aa--             <-- End of HTTP transmission


    Result example:
    <Submission message object as a json dictionary>
    """
    user = kwargs['user']
    quota_error = check_submission_quota(user)
    if quota_error:
        return make_api_response("", quota_error, 503)

    out_dir = os.path.join(TEMP_SUBMIT_DIR, get_random_id())

    with forge.get_filestore() as f_transport:
        try:
            # Get data block and binary blob
            if 'multipart/form-data' in request.content_type:
                if 'json' in request.values:
                    data = json.loads(request.values['json'])
                else:
                    data = {}
                binary = request.files['bin']
                name = data.get("name", binary.filename)
                sha256 = None
                url = None
            elif 'application/json' in request.content_type:
                data = request.json
                binary = None
                sha256 = data.get('sha256', None)
                url = data.get('url', None)
                name = data.get("name", None) or sha256 or os.path.basename(url) or None
            else:
                return make_api_response({}, "Invalid content type", 400)

            if data is None:
                return make_api_response({}, "Missing data block", 400)

            if not name:
                return make_api_response({}, "Filename missing", 400)

            name = os.path.basename(name)
            if not name:
                return make_api_response({}, "Invalid filename", 400)

            # Create task object
            if "ui_params" in data:
                s_params = ui_to_submission_params(data['ui_params'])
            else:
                s_params = ui_to_submission_params(STORAGE.user_settings.get(user['uname'], as_obj=False))

            if not s_params:
                s_params = get_default_user_settings(user)

            s_params.update(data.get("params", {}))
            if 'groups' not in s_params:
                s_params['groups'] = user['groups']

            s_params['quota_item'] = True
            s_params['submitter'] = user['uname']
            if not s_params['description']:
                s_params['description'] = "Inspection of file: %s" % name

            if not Classification.is_accessible(user['classification'], s_params['classification']):
                return make_api_response({}, "You cannot start a scan with higher "
                                             "classification then you're allowed to see", 400)

            # Prepare the output directory
            try:
                os.makedirs(out_dir)
            except Exception:
                pass
            out_file = os.path.join(out_dir, name)

            # Get the output file
            extra_meta = {}
            if not binary:
                if sha256:
                    if f_transport.exists(sha256):
                        f_transport.download(sha256, out_file)
                    else:
                        return make_api_response({}, "SHA256 does not exist in our datastore", 404)
                else:
                    if url:
                        if not config.ui.allow_url_submissions:
                            return make_api_response({}, "URL submissions are disabled in this system", 400)

                        try:
                            safe_download(url, out_file)
                            extra_meta['submitted_url'] = url
                        except FileTooBigException:
                            return make_api_response({}, "File too big to be scanned.", 400)
                        except InvalidUrlException:
                            return make_api_response({}, "Url provided is invalid.", 400)
                        except ForbiddenLocation:
                            return make_api_response({}, "Hostname in this URL cannot be resolved.", 400)
                    else:
                        return make_api_response({}, "Missing file to scan. No binary, sha256 or url provided.", 400)
            else:
                with open(out_file, "wb") as my_file:
                    my_file.write(binary.read())

            try:
                metadata = flatten(data.get('metadata', {}))
                metadata.update(extra_meta)

                submission_obj = Submission({
                    "files": [],
                    "metadata": metadata,
                    "params": s_params
                })
            except (ValueError, KeyError) as e:
                return make_api_response("", err=str(e), status_code=400)

            # Submit the task to the system
            try:
                result = SubmissionClient(datastore=STORAGE, filestore=f_transport,
                                          config=config).submit(submission_obj, local_files=[out_file], cleanup=False)
            except SubmissionException as e:
                return make_api_response("", err=str(e), status_code=400)

            return make_api_response(result.as_primitives())

        finally:
            try:
                # noinspection PyUnboundLocalVariable
                os.unlink(out_file)
            except Exception:
                pass

            try:
                shutil.rmtree(out_dir, ignore_errors=True)
            except Exception:
                pass
