# Security Policies and Procedures

This document outlines security procedures and general policies for the raw-body
project.

- [Security Policies and Procedures](#security-policies-and-procedures)
  - [Reporting a Bug or Security Vulnerability](#reporting-a-bug-or-security-vulnerability)
    - [Reporting Security Bugs via GitHub Security Advisory](#reporting-security-bugs-via-github-security-advisory)
    - [Third-Party Modules](#third-party-modules)
  - [Disclosure Policy](#disclosure-policy)
  - [Comments on this Policy](#comments-on-this-policy)

## Reporting a Bug or Security Vulnerability  

The `raw-body` team and community take all security vulnerabilities seriously. 
Thank you for improving the security of raw-body and related projects. 
We appreciate your efforts in responsible disclosure and will make every effort 
to acknowledge your contributions.  

After the initial response to your report, the owners commit to keeping you informed
about the progress toward a fix and the final announcement, and they may request additional
information or clarification during the process.

### Reporting Security Bugs via GitHub Security Advisory 

The preferred way to report security vulnerabilities is through 
[GitHub Security Advisories](https://github.com/advisories). 
This allows us to collaborate on a fix while maintaining the 
confidentiality of the report.  

To report a vulnerability
([docs](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)):  
1. Visit the **Security** tab of the affected repository on GitHub.  
2. Click **Report a vulnerability** and follow the provided steps.  

### Third-Party Modules  

If the security issue pertains to a third-party module, please report it to the maintainers of that module.  

## Disclosure Policy

When the raw-body team receives a security bug report, they will assign it to a
primary handler. This person will coordinate the fix and release process,
involving the following steps:

  * Confirm the problem and determine the affected versions.
  * Audit code to find any potential similar problems.
  * Prepare fixes for all releases still under maintenance. These fixes will be
    released as fast as possible to npm.

## Comments on this Policy

If you have suggestions on how this process could be improved please submit a
pull request.
